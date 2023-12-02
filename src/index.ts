import {
  $query,
  $update,
  Result,
  Record,
  float64,
  Vec,
  nat64,
  StableBTreeMap,
  Principal,
  ic,
} from 'azle';

type BankTransactionType = Record<{
  id: Principal;
  amount: float64;
  timestamp: nat64;
  customerID: Principal;
  operation: string;
}>;

type CustomerType = Record<{
  id: Principal;
  username: string;
  password: string;
  amount: float64;
}>;

type BankType = Record<{
  totalDeposit: float64;
  transactions: Vec<BankTransactionType>;
  customers: Vec<CustomerType>;
}>;

const bankStorage: BankType = {
  totalDeposit: 0,
  transactions: [],
  customers: [],
}; //make stable to persist state on updates

const customerStorage = new StableBTreeMap<Principal, CustomerType>(0, 44, 1024);
const transactionStorage = new StableBTreeMap<Principal, BankTransactionType>(1, 44, 1024);

let currentCustomer: CustomerType | null;


$query
export function getBankDetails(): Result<BankType, string> {
  try {
    return Result.Ok(bankStorage);
  } catch (error) {
    return Result.Err('Failed to get bank details');
  }
}

$query
export function getBalance(): Result<string, string> {
  try {
    if (!currentCustomer) {
      return Result.Err('There is no logged in customer');
    }
    return Result.Ok(`Your balance is ${currentCustomer.amount}`);
  } catch (error) {
    return Result.Err('Failed to get balance');
  }
}

$query
export function getCustomerTransactions(): Result<Vec<BankTransactionType>, string> {
  try {
    if (!currentCustomer) {
      return Result.Err('Only logged in customers can perform this operation.');
    }

    const transactions = transactionStorage.values();
    const customerTransactions = transactions.filter(
      (transaction: BankTransactionType) => transaction.customerID === currentCustomer!.id
    );

    return Result.Ok(customerTransactions);
  } catch (error) {
    return Result.Err('Failed to get transactions');
  }
}

$update
export function createTransaction(amount: float64, operation: string): Result<string, string> {
  try {
    if (!currentCustomer) {
      return Result.Err('Only logged in customers can perform this operation.');
    }

    if (operation === 'deposit') {
      currentCustomer.amount += amount;
      bankStorage.totalDeposit += amount;
    } else {
      if (currentCustomer.amount < amount) {
        return Result.Err('Account balance is lower than withdrawal amount.');
      }
      currentCustomer.amount -= amount;
      bankStorage.totalDeposit -= amount;
    }

    const newTransaction: BankTransactionType = {
      id: generateId(),
      amount,
      operation,
      timestamp: ic.time(),
      customerID: currentCustomer.id,
    };
    transactionStorage.insert(newTransaction.id, newTransaction);
    customerStorage.insert(currentCustomer.id, { ...currentCustomer });

    return Result.Ok('Transaction successful.');
  } catch (error) {
    return Result.Err('Failed to create transaction');
  }
}

//CUSTOMER
$update
export function createCustomer(username: string, password: string, amount: float64): Result<string, string> {
  try {
    const customer = customerStorage.values().find((c: CustomerType) => c.username === username);
    if (customer) {
      return Result.Err('Customer already exists.');
    }

    const newCustomer: CustomerType = {
      id: generateId(),
      username,
      password,
      amount,
    };
    customerStorage.insert(newCustomer.id, newCustomer);
    bankStorage.totalDeposit += newCustomer.amount;

    return Result.Ok(`Customer ${newCustomer.username} added successfully.`);
  } catch (error) {
    return Result.Err('Failed to create customer');
  }
}

$update
export function authenticateCustomer(username: string, password: string): Result<string, string> {
  try {
    const customer = customerStorage.values().find((c: CustomerType) => c.username === username);
    if (!customer) {
      return Result.Err('Customer does not exist.');
    }
    if (customer.password !== password) {
      return Result.Err('Customer with provided credentials does not exist.');
    }
    currentCustomer = customer;

    return Result.Ok('Logged in');
  } catch (error) {
    return Result.Err('Failed to authenticate customer');
  }
}

$update
export function signOut(): Result<string, string> {
  try {
    if (!currentCustomer) {
      return Result.Err('There is no logged-in customer.');
    }

    currentCustomer = null;
    return Result.Ok('Logged out.');
  } catch (error) {
    return Result.Err('Failed to sign out');
  }
}



$query
export function getAuthenticatedCustomer(): Result<string, string> {
  try {
    if (!currentCustomer) {
      return Result.Err('There is no logged in customer.');
    }

    return Result.Ok(currentCustomer.username);
  } catch (error) {
    return Result.Err('Failed to get authenticated customer');
  }
}




function generateId(): Principal {
  const randomBytes = new Array(29)
    .fill(0)
    .map((_) => Math.floor(Math.random() * 256));

  return Principal.fromUint8Array(Uint8Array.from(randomBytes));
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
