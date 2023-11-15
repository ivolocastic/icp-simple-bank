import {
    $query,
    $update,
    Record,
    StableBTreeMap,
    Vec, Result,
    nat64,
    ic, float64
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

type Bank = Record<{
  totalDeposit: float64;
  transactions: Vec<BankTransaction>;
}>;

type BankTransaction = Record<{
  id: string;
  amount: float64;
  timestamp: nat64;
  customerID: string;
  operation: 'deposit' | 'withdraw';
}>;

type BankTransactionData = Record<{
  amount: float64;
  operation: 'deposit' | 'withdraw';
}>;

type Customer = Record<{
  id: string;
  username: string;
  password: string;
  amount: float64;
}>;

const bankStorage = new StableBTreeMap<string, Bank>(0, 44, 2048);
const customerStorage = new StableBTreeMap<string, Customer>(1, 44, 1024);
const transactionStorage = new StableBTreeMap<string, BankTransaction>(
  2,
  44,
  2048
);
let currentCustomer: Customer | null = null;

//BANK

$query;
export function getBankDetails(): Result<Bank, string> {
  return Result.Ok<Bank, string>(bankStorage.values()[0]);
}

$query;
export function getBalance(): Result<string, string> {
  if (!currentCustomer) {
    return Result.Err<string, string>('There is no logged in customer.');
  }
  return Result.Ok<string, string>(
    `Your balance is: ${currentCustomer.amount} $`
  );
}

//CUSTOMER
$update;
export function createCustomer(
  data: Omit<Customer, 'id'>
): Result<string, string> {
  const customer = customerStorage
    .values()
    .filter((c) => c.username === data.username)[0];
  if (customer) {
    return Result.Err<string, string>('Customer already exists');
  }

  const newCustomer = {
    id: uuidv4(),
    ...data,
  };
  customerStorage.insert(newCustomer.id, newCustomer);
  return Result.Ok<string, string>(
    `Customer ${newCustomer.username} added successfully.`
  );
}

$update;
export function authenticateCustomer(
  username: string,
  password: string
): Result<string, string> {
  const customer = customerStorage
    .values()
    .filter((c) => c.username === username)[0];
  if (!customer) {
    return Result.Err<string, string>(`Customer ${username} does not exist.`);
  }
  if (customer.password !== password) {
    return Result.Err<string, string>('Credentials not matching.');
  }
  currentCustomer = customer;
  return Result.Ok<string, string>('Logged in.');
}

export function signOut(): Result<string, string> {
  if (!currentCustomer) {
    return Result.Err<string, string>('There is no logged in customer.');
  }
  currentCustomer = null;
  return Result.Ok<string, string>('Logged out.');
}

//TRANSACTIONS

$update;
export function createTransaction(
  data: BankTransactionData
): Result<string, string> {
  if (!currentCustomer) {
    return Result.Err<string, string>(
      'Only logged in customer can perform this operation.'
    );
  }
  if (data.operation === 'deposit') {
    currentCustomer.amount += data.amount;
  } else {
    if (currentCustomer.amount < data.amount) {
      return Result.Err<string, string>(
        'Account balance lower than withdrawal amount.'
      );
    }
    currentCustomer.amount -= data.amount;
  }

  const newTransaction: BankTransaction = {
    id: uuidv4(),
    timestamp: ic.time(),
    amount: data.amount,
    operation: data.operation,
    customerID: currentCustomer.id,
  };
  transactionStorage.insert(currentCustomer.id, newTransaction);
  return Result.Ok<string, string>('Operation completed successfully.');
}

$query;
export function getCustomerTransactions(): Result<
  Vec<BankTransaction>,
  string
> {
  if (!currentCustomer) {
    return Result.Err<Vec<BankTransaction>, string>(
      'Only logged in customer can perform this operation.'
    );
  }
  const customerTransactions = transactionStorage
    .values()
    .filter((transaction) => transaction.customerID === currentCustomer?.id);

  return Result.Ok<Vec<BankTransaction>, string>(customerTransactions);
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  // @ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
