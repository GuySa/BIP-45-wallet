var bitcoin = require('bitcoinjs-lib')
var crypto = require('crypto')
var Bip38 = require('bip38')
var bip39 = require('bip39')
var _ = require('lodash')

var MAX_EMPTY_ACCOUNTS = 3
var MAX_EMPTY_ADDRESSES = 3

var mainnetBlockExplorerHost = 'https://explorer.coloredcoins.org'
var testnetBlockExplorerHost = 'https://testnet.explorer.coloredcoins.org'

var BIP45Wallet = function (settings) {
  var self = this

  settings = settings || {}

  if (settings.network === 'testnet') {
    settings.blockExplorerHost = settings.blockExplorerHost || testnetBlockExplorerHost
    self.network = bitcoin.networks.testnet
  } 
  else {
    settings.blockExplorerHost = settings.blockExplorerHost || mainnetBlockExplorerHost
    self.network = bitcoin.networks.bitcoin
  }

  if (settings.privateSeed && (settings.privateKey || settings.privateSeedWIF)) {
    throw new Error('Can\'t have both privateSeed and privateKey/privateSeedWIF.')
  }

  if (settings.veryOldPrivateKey) {
    settings.oldPrivateSeedWIF = new Buffer(settings.veryOldPrivateKey, 'hex')
  }

  if (settings.oldPrivateSeed || settings.oldPrivateSeedWIF) {

    var oldSeed = settings.oldPrivateSeed || settings.oldPrivateSeedWIF
    oldSeed = crypto.createHash('sha256').update(oldSeed).digest()
    oldSeed = crypto.createHash('sha256').update(oldSeed).digest('hex')
    settings.privateSeed = oldSeed
    console.warn('Deprecated: veryOldPrivateKey, oldPrivateSeed and oldPrivateSeedWIF are deprecated, Please get your new privateSeed (for the same wallet) by getPrivateSeed or getPrivateSeedWIF.')
  }

  if (settings.privateKey && settings.privateSeedWIF && settings.privateKey !== settings.privateSeedWIF) {
    throw new Error('Can\'t privateKey and privateSeedWIF should be the same (can use only one).')
  }

  self.privateSeed = settings.privateSeed || null
  self.mnemonic = settings.mnemonic || null

  if (settings.privateKey) {
    console.warn('Deprecated: Please use privateSeedWIF and not privateKey.')
    settings.privateSeedWIF = settings.privateKey
  }

  if (settings.privateSeedWIF) {
    var privateKeySeedBigInt = bitcoin.ECKey.fromWIF(settings.privateSeedWIF, self.network).d
    self.privateSeed = privateKeySeedBigInt.toHex(32)
  }
  
  if (!self.privateSeed && !self.mnemonic) {
    self.mnemonic = bip39.generateMnemonic()
    self.privateSeed = bip39.mnemonicToSeed(self.mnemonic)
    self.needToScan = false
  } 
  else {
    if (self.mnemonic) {
      if (!bip39.validateMnemonic(self.mnemonic)) {
        throw new Error('Bad mnemonic.')
      }

      if (self.privateSeed && self.privateSeed !== bip39.mnemonicToSeedHex(self.mnemonic)) {
        throw new Error('mnemonic and privateSeed mismatch.')
      }

      self.privateSeed = bip39.mnemonicToSeed(self.mnemonic)
      self.needToScan = true
    } 
    else {
      if (!isValidSeed(self.privateSeed)) {
        throw new Error('privateSeed should be a 128-512 bits hex string (32-128 chars), if you are using WIF, use privateSeedWIF instead.')
      }
      self.privateSeed = new Buffer(self.privateSeed, 'hex')
      self.needToScan = true
    }
  }
  self.max_empty_accounts = settings.max_empty_accounts || MAX_EMPTY_ACCOUNTS
  self.max_empty_addresses = settings.max_empty_addresses || MAX_EMPTY_ADDRESSES
  self.known_fringe = settings.known_fringe || []
  self.master = bitcoin.HDNode.fromSeedHex(self.privateSeed, self.network)
  self.nextAccount = 0
  self.addresses = []
  self.preAddressesNodes = {}
  self.discovering = false
  if (settings.ds) {
    self.ds = settings.ds
  }
  self.offline = !!settings.offline
}

BIP45Wallet.createNewKey = function (network, pass, progressCallback, cosignerIndex) {
  if (typeof network === 'function') {
    progressCallback = network
    network = null
  }

  if (typeof pass === 'function') {
    progressCallback = pass
    pass = null
  }

  network = (network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin)
  var key = bitcoin.ECKey.makeRandom()
  var privateKey = key.toWIF(network)
  var privateSeed = key.d.toHex(32)
  var master = bitcoin.HDNode.fromSeedHex(privateSeed, network)
  var node = master

  // BIP0045:
  // purpose
  node = node.deriveHardened(45)
  // cosigner index

  node = node.deriveHardened(cosignerIndex)
  // account
  node = node.deriveHardened(0)

  var extendedKey = node.toBase58(false)

  var answer = {
    privateKey: privateKey,
    extendedPublicKey: extendedKey
  }

  if (pass) {
    delete answer.privateKey
    answer.encryptedPrivateKey = BIP45Wallet.encryptPrivateKey(privateKey, pass, progressCallback)
  }

  return answer
}

// TODO
BIP45Wallet.sign = function (unsignedTxHex, privateKey) {
  var tx = bitcoin.Transaction.fromHex(unsignedTxHex)
  var txb = bitcoin.TransactionBuilder.fromTransaction(tx)
  var insLength = tx.ins.length

  for (var i = 0; i < insLength; i++) {
    txb.inputs[i].scriptType = null

    if (Array.isArray(privateKey)) {
      txb.sign(i, privateKey[i])
    }
    else {
      txb.sign(i, privateKey)
    }
  }
  tx = txb.build()

  return tx.toHex()
}

BIP45Wallet.createTransaction = function (inputs, outputs, values) {
  var currentTransactionBuilder = new bitcoin.TransactionBuilder()

  currentTransactionBuilder.addInput(multiSigAddress, 0)

  for (i = 0; i < outputs.length; i++) {
    currentTransactionBuilder.addOutput(outputs[i], values[i])
  }

  return currentTransactionBuilder.buildIncomplete()

}
