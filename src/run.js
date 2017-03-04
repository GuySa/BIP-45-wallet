Wallet = require('./BIP45Wallet')

// this script is an illustration 
// Creating 3 wallets
wallets[0] = new Wallet()
wallets[1] = new Wallet()
wallets[2] = new Wallet()

wallets[0].generateMnemonicSeed('wallets[0]')
wallets[1].generateMnemonicSeed('wallets[1]')
wallets[2].generateMnemonicSeed('wallets[2]')

wallets0xpub = wallets[0].getMyXpub()
wallets1xpub = wallets[1].getMyXpub()
wallets2xpub = wallets[2].getMyXpub()

wallets[0].addXpub(wallets1xpub)
wallets[0].addXpub(wallets2xpub)

wallets[1].addXpub(wallets0xpub)
wallets[1].addXpub(wallets2xpub)

wallets[2].addXpub(wallets1xpub)
wallets[2].addXpub(wallets0xpub)

wallets[0].createTransaction()



