Wallet = require('./BIP45Wallet')

// this script is an illustration 
// Creating 3 wallets
wallets = []
wallets.push(new Wallet())
wallets.push(new Wallet())
wallets.push(new Wallet())

// Each wallet is generating a mnemonic seed with the string given as the password
wallets[0].generateMnemonicSeed('wallets[0]')
wallets[1].generateMnemonicSeed('wallets[1]')
wallets[2].generateMnemonicSeed('wallets[2]')

// Sharing the xpub keys between the wallets
wallets0xpub = wallets[0].getMyXpub()
wallets1xpub = wallets[1].getMyXpub()
wallets2xpub = wallets[2].getMyXpub()

wallets[0].addXpub(wallets1xpub)
wallets[0].addXpub(wallets2xpub)

wallets[1].addXpub(wallets0xpub)
wallets[1].addXpub(wallets2xpub)

wallets[2].addXpub(wallets1xpub)
wallets[2].addXpub(wallets0xpub)

// Creating the transaction, TODO: finish this
var outputAddress = 
wallets[0].createTransaction()

// Signing the transaction, TODO: finish this

// publishing the transaction, TODO: finish this
