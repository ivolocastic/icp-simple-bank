import {
  Canister,
  query,
  text,
  update,
  float64,
  Vec,
  nat64,
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
}; // Make stable to persist state on updates

const customerStorage = StableBTreeMap(Principal, Customer, 1);
const transactionStorage = StableBTreeMap(Principal, BankTransaction, 2);
let currentCustomer: typeof Customer | null;

export default Canister({
  getBankDetails: query([], Result(Bank, text), () => {
    return Ok(bankStorage);
  }),

  getBalance: query([], Result(float64, text), () => {
    if (!currentCustomer) {
      return Err('There is no logged in customer');
    }
    return Ok(currentCustomer.amount);
  }),

  getCustomerTransactions: query([], Result(Vec(BankTransaction), text), () => {
    if (!currentCustomer) {
      return Err('Only logged in customer can perform this operation.');
    }

    // Validate customer identity securely
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

      // Validate operation parameter
      if (operation !== 'deposit' && operation !== 'withdraw') {
        return Err('Invalid operation. Use "deposit" or "withdraw".');
      }

      // Perform transaction and update storage
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

  createCustomer: update(
    [text, text, float64],
    Result(text, text),
    (username, password, amount) => {
      // Validate the amount parameter
      if (amount < 0) {
        return Err('Amount must be a non-negative value.');
      }

      // Check if the customer already exists
      const existingCustomer = customerStorage.values().find((c: typeof Customer) => c.username === username);
      if (existingCustomer) {
        return Err('Customer already exists.');
      }

      // Create new customer and update storage
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
      const customer = customerStorage.values().find((c: typeof Customer) => c.username === username);

      if (!customer) {
        return Err('Customer does not exist.');
      }

      // Compare provided password to stored password
      if (customer.password !== password) {
        return Err('Incorrect password.');
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

  getAuthenticatedCustomer: query([], Result(Customer, text), () => {
    if (!currentCustomer) {
      return Err('There is no logged in customer.');
    }

    // Return only the necessary customer details
    const { id, username, amount } = currentCustomer;
    return Ok({ id, username, amount });
  }),
});

function generateId(): Principal {
  let generatedId: Principal;

  do {
    // Generate a new ID until it is unique
    const randomBytes = new Array(29).fill(0).map((_) => Math.floor(Math.random() * 256));
    generatedId = Principal.fromUint8Array(Uint8Array.from(randomBytes));
  } while (customerStorage.get(generatedId.toString()));

  return generatedId;
}

// Workaround to make the uuid package work with Azle
globalThis.crypto = {
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
