import {
  Canister,
  query,
  text,
  update,
  Void,
  Record,
  float64,
  Vec,
  nat64,
  StableBTreeMap,
  nat8,
  Principal,
  Err,
  Ok,
  Result,
  ic,
} from 'azle';

const BankTransaction = Record({
  id: Principal,
  amount: float64,
  timestamp: nat64,
  customerID: Principal,
  operation: text,
});

const Customer = Record({
  id: Principal,
  username: text,
  password: text,
  amount: float64,
});

const Bank = Record({
  totalDeposit: float64,
  transactions: Vec(BankTransaction),
  customers: Vec(Customer),
});

const bankStorage: typeof Bank = {
  totalDeposit: 0,
  transactions: [],
  customers: [],
}; //make stable to persist state on updates
const customerStorage = StableBTreeMap(Principal, Customer, 1);
const transactionStorage = StableBTreeMap(Principal, BankTransaction, 2);
let currentCustomer: typeof Customer | null; 

export default Canister({
  getBankDetails: query([], Result(Bank, text), () => {
    return Ok(bankStorage);
  }),
  getBalance: query([], Result(text, text), () => {
    if (!currentCustomer) {
      return Err('There is no logged in customer');
    }
    return Ok(`Your balance is ${currentCustomer.amount}`);
  }),

  //TRANSACTIONS
  getCustomerTransactions: query([], Result(Vec(BankTransaction), text), () => {
    if (!currentCustomer) {
      return Err('Only logged in customer can perform this operation.');
    }
    const transactions = transactionStorage.values();
    const customerTransactions = transactions.filter(
      (transaction: typeof BankTransaction) =>
        transaction.customerID === currentCustomer.id
    );
    return Ok(customerTransactions);
  }),
  createTransaction: update(
    [float64, text],
    Result(text, text),
    (amount, operation) => {
      if (!currentCustomer) {
        return Err('Only logged in customer can perform this operation.');
      }

      if (operation === 'deposit') {
        currentCustomer.amount += amount;
        bankStorage.totalDeposit += amount;
      } else {
        if (currentCustomer.amount < amount) {
          return Err('Account balance lower than withdrawal amount.');
        }
        currentCustomer.amount -= amount;
        bankStorage.totalDeposit -= amount;
      }
      const newTransaction: typeof BankTransaction = {
        id: generateId(),
        amount,
        operation,
        timestamp: ic.time(),
        customerID: currentCustomer.id,
      };
      transactionStorage.insert(newTransaction.id, newTransaction);
      customerStorage.insert(currentCustomer.id, { ...currentCustomer });
      return Ok('Transaction successful.');
    }
  ),

  //CUSTOMER
  createCustomer: update(
    [text, text, float64],
    Result(text, text),
    (username, password, amount) => {
      const customer = customerStorage
        .values()
        .filter((c: typeof Customer) => c.username === username)[0];
      if (customer) {
        return Err('Customer already exists.');
      }
      const newCustomer: typeof Customer = {
        id: generateId(),
        username,
        password,
        amount,
      };
      customerStorage.insert(newCustomer.id, newCustomer);
      bankStorage.totalDeposit += newCustomer.amount;
      return Ok(`Customer ${newCustomer.username} added successfully.`);
    }
  ),

  authenticateCustomer: update(
    [text, text],
    Result(text, text),
    (username, password) => {
      const customer = customerStorage
        .values()
        .filter((c: typeof Customer) => c.username === username)[0];
      if (!customer) {
        return Err('Customer does not exist.');
      }
      if (customer.password !== password) {
        return Err('Customer with provided credentials does not exist.');
      }
      currentCustomer = customer;
      return Ok('Logged in');
    }
  ),
  signOut: update([], Result(text, text), () => {
    if (!currentCustomer) {
      return Err('There is no logged in customer.');
    }
    currentCustomer = null;
    return Ok('Logged out.');
  }),

  getAuthenticatedCustomer: query([], Result(text, text), () => {
    if (!currentCustomer) {
      return Err('There is no logged in customer.');
    }
    return Ok(currentCustomer.username);
  }),
});

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
