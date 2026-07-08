function buildPaymentMessage({
  senderName, senderCountry, senderBank, senderCurrency, amount,
  recipient, targetCurrency, convertedAmount, exchangeRate,
}) {
  return {
    GrpHdr: {
      MsgId: `MSG-${Date.now()}`,
      CreDtTm: new Date().toISOString(),
      NbOfTxs: 1,
    },
    CdtTrfTxInf: {
      Dbtr: { Nm: senderName, Ctry: senderCountry },
      DbtrAgt: { FinInstnId: { Nm: senderBank } },
      InstdAmt: { Ccy: senderCurrency, value: amount },
      XchgRateInf: {
        XchgRate: exchangeRate,
        settlementCcy: targetCurrency,
        settlementAmt: convertedAmount,
      },
      Cdtr: { Nm: recipient.merchantName, Ctry: recipient.countryCode },
      CdtrAgt: { FinInstnId: { Nm: recipient.bankName } },
      CdtrAcct: { Id: recipient.accountId },
    },
  };
}

module.exports = { buildPaymentMessage };
