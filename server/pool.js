const { clusterApiUrl, Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const anchor = require('@project-serum/anchor');

const utils = require("./utils");
const { User, claimForUsers } = require("./user");

const fs = require('fs');

const path = require('path');

const idl = JSON.parse(fs.readFileSync('/home/wstar/Desktop/xhashtag-staking/target/idl/xhashtag_staking.json'));
const programID = new PublicKey(idl.metadata.address);

const walletKeyData = JSON.parse(fs.readFileSync('/home/wstar/.config/solana/id.json'));
const walletKeypair = Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

const rawdata = fs.readFileSync(path.resolve(__dirname, '../keys/token.json'));
const keyData = JSON.parse(rawdata);

const stakeRawdata = fs.readFileSync(path.resolve(__dirname, '../keys/stake-token.json'));
const stakeKeyData = JSON.parse(stakeRawdata);

const poolRawdata = fs.readFileSync(path.resolve(__dirname, '../keys/pool.json'));
const poolKeyData = JSON.parse(poolRawdata);

let xMintKey;
let xMintPubkey;
let xMintObject;
let xTokenMintObject;
let stakingMintPubkey;
let xTokenPubkey;
let stakingPubkey;
let poolPubkey;
let poolKeypair;

// const connection = new Connection(clusterApiUrl('devnet'))
const connection = new Connection('http://127.0.0.1:8899');
const rewardDuration = new anchor.BN(5);

function getProvider() {
    const provider = new anchor.Provider(
        connection, wallet, { preflightCommitment: "processed" },
    );
    return provider;
}

const provider = getProvider();
let program = new anchor.Program(idl, programID, provider);
async function initializePool() {
	const keypair = walletKeypair;
    const pubkey = keypair.publicKey;

	xMintKey = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
	xMintPubkey = xMintKey.publicKey;

	xStakeMintKey = anchor.web3.Keypair.fromSecretKey(new Uint8Array(stakeKeyData));
	stakingMintPubkey = xStakeMintKey.publicKey;

	poolKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(poolKeyData));
    // poolKeypair = anchor.web3.Keypair.generate();
	poolPubkey = poolKeypair.publicKey;

    xTokenMintObject = new Token(provider.connection, xMintPubkey, TOKEN_PROGRAM_ID, provider.wallet.payer);
    stakingMintObject = new Token(provider.connection, stakingMintPubkey, TOKEN_PROGRAM_ID, provider.wallet.payer);

    let xTokenAccountInfo = await xTokenMintObject.getOrCreateAssociatedAccountInfo(pubkey);
    xTokenPubkey = xTokenAccountInfo.address;
    // xTokenPubkey = new PublicKey('6ZwcEbfPevDAzi2Gwy7KqPonKoSAqNVkzfHVs8jwhmjx');

    stakingTokenAccountInfo = await stakingMintObject.getOrCreateAssociatedAccountInfo(pubkey);
    stakingPubkey = stakingTokenAccountInfo.address;
    // stakingPubkey = new PublicKey('GkmFeNWjZQuAfF8RVEnDptqyS5z8FGe3sGSARvJTQCn8');

    await xTokenMintObject.mintTo(xTokenPubkey, wallet.payer, [], 10000000000);
    await stakingMintObject.mintTo(stakingPubkey, wallet.payer, [], 0);

    const [
        _poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolKeypair.publicKey.toBuffer()],
        program.programId
    );
    let poolSigner = _poolSigner;
    let poolNonce = _nonce;

    let xTokenPoolVault = await xTokenMintObject.createAccount(poolSigner);
    let stakingMintVault = await stakingMintObject.createAccount(poolSigner);

    console.log("X Token pool vault: ", xTokenPoolVault.toBase58())
    console.log("X Stake Token vault: ", stakingMintVault.toBase58())
    let admin = {
        poolKeypair,
        poolSigner,
        poolNonce,
        xTokenPoolVault,
        stakingMintVault
    };

    await program.rpc.initializePool(
        poolNonce,
        rewardDuration,
        {
            accounts: {
                authority: provider.wallet.publicKey,
                xTokenPoolVault: xTokenPoolVault,
                xTokenDepositor: xTokenPubkey,
                xTokenDepositAuthority: provider.wallet.publicKey,
                stakingMint: stakingMintObject.publicKey,
                stakingVault: stakingMintVault,
                rewardAMint: stakingMintObject.publicKey,
                rewardAVault: stakingMintVault,
                rewardBMint: stakingMintObject.publicKey,
                rewardBVault: stakingMintVault,
                poolSigner: poolSigner,
                pool: poolPubkey,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [poolKeypair],
            instructions: [
                await program.account.pool.createInstruction(poolKeypair, ),
            ],
        }
    );
}

initializePool();