require("dotenv").config();
const ethers = require("ethers");
const { default: inquirer } = require("inquirer");

// Chain configurations
const CHAINS = {
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC,
    contractAddress: process.env.OPTIMISM_CONTRACT_ADDRESS,
    chainId: 11155420,
  },
  "base-sepolia": {
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
    contractAddress: process.env.BASE_CONTRACT_ADDRESS,
    chainId: 84532,
  },
};

// Contract ABI
const CONTRACT_ABI =
  require("../artifacts/contracts/CrossChainStore.sol/CrossChainStore.json").abi;

async function main() {
  // Validate environment variables
  const requiredEnvVars = [
    "PRIVATE_KEY",
    "OPTIMISM_CONTRACT_ADDRESS",
    "BASE_CONTRACT_ADDRESS",
    "OPTIMISM_SEPOLIA_RPC",
    "BASE_SEPOLIA_RPC",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(`Using wallet address: ${wallet.address}`);

  // Get user input
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "sourceChain",
      message: "Select the source chain:",
      choices: [
        {
          name: "Optimism Sepolia",
          value: "optimism-sepolia",
        },
        {
          name: "Base Sepolia",
          value: "base-sepolia",
        },
      ],
    },
    {
      type: "list",
      name: "destinationChain",
      message: "Select the destination chain:",
      choices: (answers) => {
        return Object.entries(CHAINS)
          .filter(([key]) => key !== answers.sourceChain)
          .map(([key, chain]) => ({
            name: chain.name,
            value: key,
          }));
      },
    },
    {
      type: "input",
      name: "key",
      message: "Enter the key:",
      validate: (input) => {
        if (!input.trim()) {
          return "Key cannot be empty";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "value",
      message: "Enter the value:",
      validate: (input) => {
        if (!input.trim()) {
          return "Value cannot be empty";
        }
        return true;
      },
    },
  ]);

  // Get chain configurations
  const sourceChainConfig = CHAINS[answers.sourceChain];
  const destinationChainConfig = CHAINS[answers.destinationChain];

  console.log("\nTransaction Details:");
  console.log(`From Chain: ${sourceChainConfig.name}`);
  console.log(`To Chain: ${destinationChainConfig.name}`);
  console.log(`Key: ${answers.key}`);
  console.log(`Value: ${answers.value}`);

  const bytesValue = ethers.toUtf8Bytes(answers.value);
  console.log(`Value in bytes: 0x${Buffer.from(bytesValue).toString("hex")}`);

  // Confirm transaction
  const confirmation = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Do you want to proceed with this transaction?",
      default: false,
    },
  ]);

  if (!confirmation.proceed) {
    console.log("Transaction cancelled");
    return;
  }

  try {
    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(sourceChainConfig.rpcUrl);
    const connectedWallet = wallet.connect(provider);
    const contract = new ethers.Contract(
      sourceChainConfig.contractAddress,
      CONTRACT_ABI,
      connectedWallet
    );

    // Convert value to bytes
    const valueBytes = ethers.toUtf8Bytes(answers.value);

    // Estimate gas
    console.log("\nEstimating gas...");
    const estimatedGas = await contract.setValue.estimateGas(
      answers.key,
      valueBytes,
      destinationChainConfig.chainId
    );

    console.log(`Estimated gas: ${estimatedGas.toString()}`);

    // Send transaction
    console.log("Sending transaction...");
    const tx = await contract.setValue(
      answers.key,
      valueBytes,
      destinationChainConfig.chainId,
      {
        gasLimit: estimatedGas,
      }
    );

    console.log(`Transaction submitted: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log(
      `Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`
    );

    // Find the ValueSet event
    const valueSetEvent = receipt.logs.find(
      (log) => log.fragment?.name === "ValueSet"
    );

    if (valueSetEvent) {
      const { sender, key, value, destinationChainId, nonce, hashedKey } =
        valueSetEvent.args;

      console.log("\nEvent Details:");
      console.log(`Sender: ${sender}`);
      console.log(`Key: ${key}`);
      console.log(`Value: ${ethers.toUtf8String(value)}`);
      console.log(`Destination Chain ID: ${destinationChainId}`);
      console.log(`Nonce: ${nonce}`);
      console.log(`HashedKey: ${hashedKey}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
