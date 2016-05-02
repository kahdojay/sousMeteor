if(Meteor.isServer){
  Meteor.methods({
    // Note: currently this is just for Bricolage/HVM - if this approach scales out, we'll want a collection for header settings instead of hard coding headers here, and enforce our own header template to the extent possible.
    uploadOrderToSheetsu: function(endpoint, order) {
      log.debug('SENDING ORDER TO SHEETSU: ', endpoint)

      var sendProduct = order.orderProductList.shift()
      var orderDate = moment(order.orderDate)
      // Determine the soonest Tuesday on or after the orderDate (HVM ships to Bricolage only on Tuesdays)
      var thisWeeksTues = moment().startOf('week').add(2, 'days')
      // 
      var shipDate = thisWeeksTues.isAfter(orderDate) ? thisWeeksTues : moment().startOf('week').add(9, 'days')

      Meteor.setTimeout(function() {
        Meteor.http.post(endpoint, {
          headers: null,
          data: {
            'Order #': `${order.orderRef}`,
            'Ship Date': shipDate.format('ddd M/D'),
            'Customer ID': '46',
            'Customer': 'Bricolage',
            'Ordered Qty': `${sendProduct.quantity} ${sendProduct.unit}`,
            'Item ID': sendProduct.sku,
            'Item': sendProduct.name,
            'Itm Notes': sendProduct.description,
            'Order Date': orderDate.format('ddd M/D h:mm a'),
          }
        })
        if(order.orderProductList.length > 0){
          Meteor.call('uploadOrderToSheetsu', endpoint, order)
        }
      }, 300)
    }
  })
}