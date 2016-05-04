if(Meteor.isServer){
  Meteor.methods({
    exportPurveyors: function() {
      var ret = {
        success: null,
        purveyors: {
          count: null
        },
        remove: null,
        export: null,
      }
      ret.remove = Export.remove({})
      var purveyorOptions = {}
      // purveyorOptions = {limit:10};
      var allPurveyors = Purveyors.find({teamCode: {$not: /DEMO/}},purveyorOptions).fetch();
      ret.purveyors.count = allPurveyors.length;
      ret.export = 0

      allPurveyors.forEach(function(purveyor) {
        var exportPurveyorAttributes = {
          process: 'TRUE',
          action: (purveyor.deleted === true ? 'REMOVE' : ''),
          _id: purveyor._id,
          teamCode: purveyor.teamCode,
          purveyorCode: purveyor.purveyorCode,
          name: purveyor.name,
          orderEmails: purveyor.orderEmails,
          timeZone: purveyor.timeZone,
          orderCutoffTime: purveyor.orderCutoffTime,
          orderMinimum: purveyor.orderMinimum,
          deliveryDays: purveyor.deliveryDays,
          notes: purveyor.notes,
          email: purveyor.email,
          phone: purveyor.phone,
          orderContact: purveyor.orderContact,
          description: purveyor.description,
          sendEmail: (purveyor.sendEmail === true ? 'TRUE' : 'FALSE'),
          sendFax: (purveyor.sendFax === true ? 'TRUE' : 'FALSE'),
          fax: purveyor.fax,
          uploadToFTP: (purveyor.uploadToFTP === true ? 'TRUE' : 'FALSE'),
          sheetsu: purveyor.sheetsu,
          imageUrl: purveyor.imageUrl,
        };
        log.debug("PURVEYOR EXPORT: ", exportPurveyorAttributes)
        Export.insert(exportPurveyorAttributes);
        ret.export += 1;
      })

      return ret;
    },
    exportProducts: function() {
      var ret = {
        success: null,
        products: {
          count: null
        },
        remove: null,
        export: null,
      }
      ret.remove = Export.remove({})
      var productOptions = {}
      // productOptions = {limit:10};
      var allProducts = Products.find({teamCode: {$not: /DEMO/}},productOptions).fetch();
      var allCategories = Categories.find({teamCode: {$not: /DEMO/}}).fetch();
      var allPurveyors = Purveyors.find({teamCode: {$not: /DEMO/}}).fetch();
      ret.products.count = allProducts.length;
      ret.export = 0

      allProducts.forEach(function(product) {
        var categoryName = _.filter(allCategories, function(category){
          return category.products.indexOf(product._id) !== -1
        });
        var purveyorCodes = _.map(_.filter(allPurveyors, function(purveyor){
          return product.purveyors.indexOf(purveyor._id) !== -1
        }), function(purveyor) {
          return purveyor.purveyorCode;
        });
        var exportProductAttributes = {
          process: 'TRUE',
          _id: product._id,
          action: (product.deleted === true ? 'REMOVE' : ''),
          name: product.name,
          teamCode: product.teamCode,
          category: (categoryName[0]) ? categoryName[0].name : '',
          purveyors: purveyorCodes.join(','),
          amount: product.amount,
          unit: product.unit,
          par: product.par || '',
          sku: product.sku || '',
          description: product.description,
          price: product.price,
          packSize: product.packSize || '',
        };
        log.debug("PRODUCT EXPORT: ", exportProductAttributes)
        Export.insert(exportProductAttributes);
        ret.export += 1;
      })

      return ret;
    },
  })
}
