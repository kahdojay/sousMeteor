if(Meteor.isServer){
  Meteor.methods({

    // imageKey is the key in the s3 bucket
    streamS3Image: function(imageData, imageKey, userId) {
      // put arguments: base64 string, object key, mime type, permissions
      putter.put(
        imageData,
        imageKey,
        'image/jpeg',
        'public-read',
        Meteor.bindEnvironment(function(response) {
          Meteor.users.update({_id: userId}, {$set: {
            imageUrl: response.url,
            imageChangedAt: (new Date()).toISOString(),
            updatedAt: (new Date()).toISOString(),
          }})
        })
      );
    },

    streamS3InvoiceImages: function(orderId, invoiceImages, userId) {
      log.debug("UPLOADING INVOICES - for orderId: ", orderId, " invoices: ", invoiceImages.length, " added by userId: ", userId)

      // put arguments: base64 string, object key, mime type, permissions
      var bodyLinks = []
      invoiceImages.forEach(function(invoice){
        bodyLinks.push(`- https://sous-assets-production.s3.amazonaws.com/${invoice.name}`)
        putter.put(
          invoice.data,
          invoice.name,
          invoice.type,
          'public-read',
          Meteor.bindEnvironment(function(response) {
            Orders.update({_id: invoice.orderId}, {
              $push: { invoices: {
                id: invoice.id,
                userId: invoice.userId,
                imageUrl: response.url,
                location: 'server',
                createdAt: invoice.createdAt,
                updatedAt: (new Date()).toISOString(),
              }},
              $set: {
                updatedAt: (new Date()).toISOString(),
              }
            })
          })
        );
      })

      var user = Meteor.users.findOne({_id: userId});
      var order = Orders.findOne({_id: orderId});
      var team = Teams.findOne({ _id: order.teamId });
      var purveyor = Purveyors.findOne({ _id: order.purveyorId });
      var timeZone = 'UTC';
      if(purveyor.hasOwnProperty('timeZone') && purveyor.timeZone){
        timeZone = purveyor.timeZone;
      }

      var orderDate = moment(order.orderedAt).tz(timeZone);


      Meteor.call('sendEmail', {
        type: 'UPLOAD_ORDER_INVOICE',
        fromEmail: 'invoices@sousapp.com',
        fromName: `${user.firstName} ${user.lastName}`,
        subject: `Invoice(s) uploaded for Order: ${purveyor.name} by ${team.name} on ${orderDate.format('dddd, MMMM D')}`,
        body: `Order: ${purveyor.name} by ${team.name} on ${orderDate.format('dddd, MMMM D')} at ${orderDate.format('h:mm A')} \n\n Invoices uploaded: \n\n ${bodyLinks.join('\n')} \n\n Thank you,\n Sous Invoice Bot`,
      })
    },
  })
}
