if(Meteor.isServer){
  Meteor.methods({
    // Note: currently this is just for HVM, will want to start using TeamPurveyorSettings soon
    uploadOrderToSheetsu: function(endpoint, options) {
      // HVM ships to Bricolage only on Tuesdays, Mon 6PM cutoff
      log.debug('SENDING ORDER TO SHEETSU: ', endpoint, options.orderId)
      var orderDate = options.orderDate ? moment(options.orderDate) : moment()
      var orderCutoff = moment().startOf('week').add(1, 'days').add(18,'hours')
      var thisWeeksTues = moment().startOf('week').add(2, 'days')
      var nextWeeksTues = moment().startOf('week').add(9, 'days')
      var shipDate = orderDate.isBefore(orderCutoff) ? thisWeeksTues : nextWeeksTues

      var productRows = []
      let productIdx = 0
      options.orderProductList.forEach(function(product) {
      log.debug('QUEUEING PRODUCT FOR SHEETSU: ', product)
        productRows.push({
          "lineid": productIdx,
          "externalid": options.orderRef || 'n/a',
          "shipdate": shipDate.format('ddd M/D'),
          "customerid": options.purveyor.customerNumber || 'n/a',
          "customer": options.team.name || 'n/a',
          "orderedqty": `${product.quantity} ${product.unit}`,
          "itemid": product.sku,
          "item": product.name,
          "itmnotes": product.description,
          "orderdate": orderDate.format('MM/DD/YYYY'),
        })
        productIdx ++
      })
      Meteor.http.post(endpoint, {
        data: {
          rows: productRows
        }
      }, Meteor.bindEnvironment(function(err, res) {
        if(err){
          log.error('SHEETSU ERROR: ', err)
        }
        log.trace('SHEETSU RESPONSE: ', res)
      }))
    }
  })
}