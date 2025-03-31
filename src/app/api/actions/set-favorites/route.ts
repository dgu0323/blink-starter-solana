import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ActionError,
  ACTIONS_CORS_HEADERS,
  BLOCKCHAIN_IDS,
} from "@solana/actions";

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import { BN } from "@project-serum/anchor";

// CAIP-2 format for Solana
const blockchain = BLOCKCHAIN_IDS.devnet;

// Create a connection to the Solana blockchain
const connection = new Connection("https://api.devnet.solana.com");
// const connection = new Connection("https://rpc.ankr.com/solana_devnet");

// Program ID from your contract
const PROGRAM_ID = new PublicKey("4Pm9xVzVsQJMmodRdANm28UapsES4Ffy13AKeSPuEtqy");

// Create headers with CAIP blockchain ID
const headers = {
  ...ACTIONS_CORS_HEADERS,
  "x-blockchain-ids": blockchain,
  "x-action-version": "2.4",
};

// OPTIONS endpoint is required for CORS preflight requests
export const OPTIONS = async () => {
  return new Response(null, { headers });
};

// GET endpoint returns the Blink metadata (JSON) and UI configuration
export const GET = async (req: Request) => {
  const response: ActionGetResponse = {
    type: "action",
    icon: `${new URL("/donate-sol.jpg", req.url).toString()}`,
    label: "Set Favorites",
    title: "Set Your Favorites",
    description: "Set your favorite number and color on the Solana blockchain.",
    links: {
      actions: [
        {
          type: "transaction",
          href: `/api/actions/set-favorites?number={number}&color={color}`,
          label: "Set Favorites",
          parameters: [
            {
              name: "number",
              label: "Enter your favorite number",
              type: "number",
            },
            {
              name: "color",
              label: "Enter your favorite color",
              type: "text",
            },
          ],
        },
      ],
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers,
  });
};

// POST endpoint handles the actual transaction creation
export const POST = async (req: Request) => {
  try {
    // Extract parameters from the URL
    const url = new URL(req.url);
    const number = Number(url.searchParams.get("number"));
    const color = url.searchParams.get("color") || "";

    // Payer public key is passed in the request body
    const request: ActionPostRequest = await req.json();
    const user = new PublicKey(request.account);

    // Generate PDA for the favorites account
    const [favoritesPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fav"), user.toBuffer()],
      PROGRAM_ID
    );

    // Step 2: Prepare the transaction
    const transaction = await prepareTransaction(
      connection,
      user,
      favoritesPda,
      number,
      color
    );

    // Step 3: Create a response with the serialized transaction
    const response: ActionPostResponse = {
      type: "transaction",
      transaction: Buffer.from(transaction.serialize()).toString("base64"),
    };

    return Response.json(response, { status: 200, headers });
  } catch (error) {
    console.error("Error processing request:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const errorResponse: ActionError = {
      message,
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers,
    });
  }
};

const prepareTransaction = async (
  connection: Connection,
  user: PublicKey,
  favoritesPda: PublicKey,
  number: number,
  color: string
) => {
  // Create the instruction data
  const instructionData = Buffer.from([
    // Anchor discriminator (8 bytes)
    ...new BN(8).toArray("le", 8),
    // Instruction index for set_favorites (1 byte)
    0,
    // Number (8 bytes)
    ...new BN(number).toArray("le", 8),
    // Color string length (4 bytes)
    ...new BN(color.length).toArray("le", 4),
    // Color string bytes
    ...Buffer.from(color),
  ]);

  // Create the instruction
  const instruction = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: favoritesPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  };

  // Get the latest blockhash
  const { blockhash } = await connection.getLatestBlockhash();

  // Create a transaction message
  const message = new TransactionMessage({
    payerKey: user,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  // Create and return a versioned transaction
  return new VersionedTransaction(message);
}; 