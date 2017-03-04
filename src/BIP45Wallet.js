var request = require('request')
var bitcoin = require('bitcoinjs-lib')
var crypto = require('crypto')
var Bip38 = require('bip38')
var bip39 = require('bip39')
var _ = require('lodash')

// concatinate to this prefix the public address to get the last (atmost 200) transactions to this address
var BLOCKR_ADDR_INFO_REQUEST_URL_PREFIX = 'btc.blockr.io/api/v1/address/unspent/'

// concatinate to this prefix the public address to get the last (atmost 200) transactions to this address
var BLOCKR_ADDR_BALANCE_REQUEST_URL_PREFIX = 'btc.blockr.io/api/v1/address/balance/'

// make a POST request to this url with the transaction hex in a field called "hex"
var BLOCKR_PUBLISH_TRANSACTION_URL = 'http://btc.blockr.io/api/v1/tx/push'

var CHANGE = 1
var NOT_CHANGE = 0


var BIP45Wallet = function () {
  this.seed = {}
  this.network = 'testnet'
  this.xPubs = []
  this.addressIndex = 0
  this.clientAddressIndex = 0
}

BIP45Wallet.prototype.getSeed = function () {
  return this.seed
}

BIP45Wallet.prototype.setSeed = function (mnemonic, password) {
  var seed = bip39.mnemonicToSeed(mnemonic, password)
  this.seed = seed
}

BIP45Wallet.prototype.generateMnemonicSeed = function (password) {
  var mnemonic = bip39.generateMnemonic()
  this.setSeed(mnemonic, password)
  console.log('Your mnemonic is:\n%s\nWrite it down and don\'t lose it', mnemonic)
}

BIP45Wallet.prototype.deriveXpubFromSeed = function (cosignerIndex) {
  m = bitcoin.HDNode.fromBase58(seed, network)

  return m.derivePath("m/").neutered().toBase58()
}

BIP45Wallet.deriveXprivFromSeed = function (seed, cosignerIndex) {
  m = bitcoin.HDNode.fromBase58(seed, network)

  return m.derivePath("m/").toBase58()
}

BIP45Wallet.derivePublicKey = function (xPub, change, addressIndex) {
  m = bitcoin.HDNode.fromBase58(xPub, network)

  return m.derivePath("m/" + change + "/" + addressIndex).neutered().toBase58()
}

BIP45Wallet.derivePrivateKey = function (xPriv, change, addressIndex) {
  m = bitcoin.HDNode.fromBase58(xPub, network)

  return m.derivePath("m/" + change + "/" + addressIndex).keyPair.toWIF()
}

BIP45Wallet.createTransaction = function (xPubInputs, outputAddress, outputValue, n) {
  var currentTransactionBuilder = new bitcoin.TransactionBuilder()

  var inputs = []

  p2shAddress = getP2SHAddress(xPubInputs, NOT_CHANGE, self.addressIndex)

  // Getting the current balance available in the current address
  currentBalance = getAddressBalance(p2shAddress)

  // Checking if the balance doesn't allow the requested transaction
  if (outputValue > currentBalance) {
    console.error('You are trying to send more bitcoins than you have!')
    return
  }

  // Getting the last unspent transaction
  lastUnspentTransaction = getLastTransaction(p2shAddress)

  // Adding the input
  currentTransactionBuilder.addInput(lastUnspentTransaction.tx, lastUnspentTransaction.n)

  // Adding the output
  currentTransactionBuilder.addOutput(outputAddress, outputValue)

  recommendedFee = currentTransactionBuilder.tx.byteLength*0.0000001

  // Checking if the transaction fee is less than recommended 
  // Assuming 10 satoshis per byte
  if (outputValue - currentBalance < recommendedFee) {
    console.warn('You are giving less transaction fee than recommended')
  }

  // Checking if there is change from the transaction and sending it to a change address, if yes
  if (outputValue + recommendedFee < currentBalance) {
    changeP2SHAddress = getP2SHAddress(xPubInputs, CHANGE, self.changeAddressIndex)
    currentTransactionBuilder.addOutput(changeP2SHAddress, currentBalance - outputValue - recommendedFee)
    console.log('Returning the difference between your balance and the output value to a change address @ %s', changeP2SHAddress)
  }

  return currentTransactionBuilder.buildIncomplete().toHex()
}

BIP45Wallet.signYourself = function (inputTxHex, privKey) {
  var tx = bitcoin.Transaction.fromHex(inputTxHex)
  var currentTransactionBuilder = bitcoin.TransactionBuilder.fromTransaction(tx)
}

// TODO - remove this after you finish BIP45Wallet.signYourself
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

BIP45Wallet.publishTransaction = function (txHex) {

  rawResponse = request.post(BLOCKR_PUBLISH_TRANSACTION_URL, { hex: txHex }, function (err, httpResponse, body) {

    var parsedResponse = JSON.parse(body)

    if (parsedResponse.status !== 'success') {
        throw new Error('Received a non successful response from blockr')
    }
  })
}

BIP45Wallet.getLastTransaction = function (publicAddress) {
  var rawResponse
  var parsedResponse

  rawResponse = request(BLOCKR_ADDR_INFO_REQUEST_URL_PREFIX + publicAddress)
  parsedResponse = JSON.parse(rawResponse)

  if (parsedResponse.status !== 'success') {
      throw new Error('Received a non successful response from blockr')
  }

  // [0] because we are taking the first transaction in the list, which is the last one, chronologically
  var currentTx = parsedResponse.data.unspent[0].tx
  var currentN = parsedResponse.data.unspent[0].n
  
  return { 'tx': currentTx, 'n': currentN }
}

BIP45Wallet.getAddressBalance = function (publicAddress) {
  var rawResponse
  var parsedResponse

  rawResponse = request(BLOCKR_ADDR_BALANCE_REQUEST_URL_PREFIX + publicAddress)
  parsedResponse = JSON.parse(rawResponse)

  if (parsedResponse.status !== 'success') {
      throw new Error('Received a non successful response from blockr')
  }

  var currentBalance = parsedResponse.data.balance
  
  return currentBalance
}

BIP45Wallet.getP2SHAddress = function (xPubInputs, change, addressIndex) {
  // Sorting the array, so that in the following loop I can use i as the cosigner index
  xPubInputs.sort()

  for (i = 0; i < xPubInputs.length; i++) {
      inputs.add(BIP45Wallet.derivePublicKey(xPubInputs[i], change, addressIndex))
  }

  // Creating the P2SH address
  var redeemScript = bitcoin.script.multisigOutput(n, inputs)
  var scriptPubKey = bitcoin.script.scriptHashOutput(bitcoin.crypto.hash160(redeemScript))
  var p2shAddress = bitcoin.address.fromOutputScript(scriptPubKey, network)

  return p2shAddress
}

module.exports = BIP45Wallet
