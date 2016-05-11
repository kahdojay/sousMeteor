if(Meteor.isServer){
  Meteor.methods({
    // Note: currently this is just for HVM, will want to start using TeamPurveyorSettings soon
    uploadOrderToSheetsu: function(endpoint, options) {
      // HVM ships to Bricolage only on Tuesdays, Mon 6PM cutoff
      log.debug('SENDING ORDER TO SHEETSU: ', endpoint, options.orderId)
      var orderDate = moment(options.orderDate)
      var orderCutoff = moment().startOf('week').add(1, 'days').add(18,'hours')
      var thisWeeksTues = moment().startOf('week').add(2, 'days')
      var nextWeeksTues = moment().startOf('week').add(9, 'days')
      var shipDate = orderDate.isBefore(orderCutoff) ? thisWeeksTues : nextWeeksTues

      var productRows = []
      options.orderProductList.forEach(function(product) {
      log.debug('QUEUEING PRODUCT FOR SHEETSU: ', product)
        productRows.push({
          "External ID": options.orderRef || 'n/a',
          "Ship Date": shipDate.format('ddd M/D'),
          "Customer ID": options.purveyor.customerNumber || 'n/a',
          "Customer": options.team.name || 'n/a',
          "Ordered Qty": `${product.quantity} ${product.unit}`,
          "Item ID": product.sku,
          "Item": product.name,
          "Itm Notes": product.description,
          "Order Date": orderDate.format('ddd M/D h:mm a'),
        })
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