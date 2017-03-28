if(Meteor.isServer){
  Meteor.methods({

    getCategories: function(teamId) {
      var queryOptions = {
        sort: { name: 1 },
      };
      var query = {
        teamId: teamId
      };
      log.trace("Retrieving categories, with query: ", query, " queryOptions: ", queryOptions);
      return Categories.find(query,queryOptions).fetch();
    },

    getProducts: function(teamId) {
      var queryOptions = {
        sort: { name: 1 },
      };
      var query = {
        teamId: teamId
      };
      log.trace("Retrieving products, with query: ", query, " queryOptions: ", queryOptions);
      return Products.find(query,queryOptions).fetch();
    },

    createProduct: function(productAttributes, productLookup, cb) {
      log.trace("PRODUCT ATTRS", productAttributes);
      var ret = {
        update: null,
      };
      var productLookup = productLookup || { _id: productAttributes._id, teamId: productAttributes.teamId };
      var cb = cb || function(){}
      var productAmount = productAttributes.amount.toString();
      if(productAmount.indexOf('/') !== -1){
        var fractionArray = productAttributes.amount.split('/')
        try {
          productAmount = parseFloat(parseInt(fractionArray[0])/parseInt(fractionArray[1])).toString()
        } catch (e) {
          log.error('UNABLE TO CONVERT FRACTION to DECIMAL: ', productAttributes.amount);
          log.error('ERROR: ', e);
        }
      }
      // upsert the productRow
      var productUpdate = {
        $set: {
          name: productAttributes.name,
          teamId: productAttributes.teamId,
          teamCode: productAttributes.teamCode,
          description: productAttributes.description || '',
          price: productAttributes.price,
          purveyors: productAttributes.purveyors,
          amount: productAmount,
          unit: productAttributes.unit,
          par: productAttributes.par ? productAttributes.par.toString() : '',
          sku: productAttributes.sku ? productAttributes.sku.toString() : '',
          packSize: productAttributes.packSize ? productAttributes.packSize.toString() : '',
          deleted: productAttributes.deleted,
          updatedAt: productAttributes.updatedAt || (new Date()).toISOString()
        },
        $setOnInsert: {
          createdAt: productAttributes.createdAt || (new Date()).toISOString()
        }
      }
      if(productAttributes.hasOwnProperty('_id') === true){
        productUpdate.$setOnInsert._id = productAttributes._id
      }
      log.debug("PRODUCT ATTRS UPDATE - lookup: ", productLookup, " attrs: ", productUpdate);
      ret.update = Products.update(
        productLookup,
        productUpdate,
        { upsert: true },
        Meteor.bindEnvironment(function() {
          var productChanged = Products.findOne(productLookup);
          log.debug('Product Add/Updated: ', productChanged)
          if(cb !== undefined){
            cb(productChanged)
          }
        })
      ); // end Products.update

      return ret;
    },

    updateProduct: function(productId, productAttributes) {
      var realProductId = {_id: productId};
      productAttributes.updatedAt = (new Date()).toISOString();
      var updatedProduct = Products.findOne(realProductId);
      Object.keys(productAttributes).forEach(function(key){
        if(APPROVED_PRODUCT_ATTRS.hasOwnProperty(key) && APPROVED_PRODUCT_ATTRS[key] === true){
          updatedProduct[key] = productAttributes[key];
        }
      })
      if(updatedProduct.hasOwnProperty('deleted') === true && updatedProduct.deleted === true){
        updatedProduct.deletedAt = (new Date()).toISOString()
      }
      log.debug("UPDATE PRODUCT ATTRS ", updatedProduct);
      return Products.update(realProductId, {$set: updatedProduct});
    },

    createCategory: function(categoryAttributes, categoryLookup, cb) {
      log.debug("CREATE CATEGORY ATTRS", categoryAttributes);
      var ret = {
        category: null,
        update: null,
      };
      var categoryLookup = categoryLookup || { name: categoryAttributes.name, teamId: categoryAttributes.teamId};
      var cb = cb || function(){}
      var categoryUpdate = {
        $set: {
          name: categoryAttributes.name,
          teamId: categoryAttributes.teamId,
          teamCode: categoryAttributes.teamCode,
          products: categoryAttributes.products,
          deleted: categoryAttributes.deleted,
          updatedAt: categoryAttributes.updatedAt || (new Date()).toISOString()
        },
        $setOnInsert: {
          createdAt: categoryAttributes.createdAt || (new Date()).toISOString()
        }
      }
      if(categoryAttributes.hasOwnProperty('_id') === true){
        categoryUpdate.$setOnInsert._id = categoryAttributes._id
      }
      ret.update = Categories.update(
        categoryLookup,
        categoryUpdate,
        { upsert: true },
        cb
      );
      ret.category = Categories.findOne(categoryLookup);

      return ret;
    },

    updateCategory: function(categoryId, categoryAttributes) {
      var realCategoryId = {_id: categoryId};
      categoryAttributes.updatedAt = (new Date()).toISOString();
      var updatedCategory = Categories.findOne(realCategoryId);
      Object.keys(categoryAttributes).forEach(function(key){
        if(APPROVED_CATEGORY_ATTRS.hasOwnProperty(key) && APPROVED_CATEGORY_ATTRS[key] === true){
          updatedCategory[key] = categoryAttributes[key];
        }
      })
      if(updatedCategory.hasOwnProperty('deleted') === true && updatedCategory.deleted === true){
        updatedCategory.deletedAt = (new Date()).toISOString()
      }
      log.debug("UPDATE CATEGORY ATTRS ", updatedCategory);
      return Categories.update(realCategoryId, {$set: updatedCategory});
    },

    addProductToCategory: function(categoryLookup, productId){
      return Meteor.call('addProductCategory', categoryLookup, productId);
    },

    addProductCategory: function(categoryLookup, productId){
      log.debug("ADD PRODUCT CATEGORY ATTRS", categoryLookup, productId);
      var ret = {
        categoryLookup: categoryLookup,
        update: null,
        exists: null,
        success: null,
        error: null,
      };
      var category = Categories.findOne(categoryLookup);
      if(category === undefined){
        ret.success = false
        ret.error = [{
          message: 'Could not find category using params',
          categoryLookup: categoryLookup
        }]
        log.error('addProductCategory - Could not find category using params', categoryLookup)
      } else {
        if(category.products.indexOf(productId) !== -1){
          ret.exists = true;
        } else {
          var product = Products.findOne({_id: productId});
          if(product !== undefined){
            var categoryUpdate = Categories.update(
              categoryLookup,
              {
                $push : { products: productId },
                $set: {
                  deleted: false,
                  updatedAt: (new Date()).toISOString()
                },
              }
            );
            ret.update = categoryUpdate
            log.debug('addProductCategory - Category update', categoryUpdate)
          } else {
            ret.success = false
            ret.error = [{
              message: 'Could not find product',
              productId: productId
            }]
            log.error('addProductCategory - Could not find product', productId)
          }
        }
        ret.success = true;
      }
      return ret
    },

    updateProductCategory: function(categoryLookup, productId){
      log.debug("UPDATE PRODUCT CATEGORY ATTRS", categoryLookup, productId);
      var ret = {
        categoryLookup: categoryLookup,
        addProductCategory: null,
      };

      // remove the product from other categories...
      var existingCategory = Categories.findOne({products: {$in: [productId]}});
      if(existingCategory){
        var categoryProducts = existingCategory.products;
        var productIdx = categoryProducts.indexOf(productId);
        if(productIdx !== -1){
          categoryProducts = existingCategory.products.slice(0, productIdx);
          categoryProducts = categoryProducts.concat(existingCategory.products.slice(productIdx+1));
        }
        Categories.update({_id: existingCategory._id}, {$set:{products: categoryProducts}});
      }

      ret.addProductCategory = Meteor.call('addProductCategory', categoryLookup, productId);

      return ret;

    },

    deleteCategory: function(categoryId, deleteCategoryAttributes) {
      log.debug("DELETE CATEGORY ", categoryId, deleteCategoryAttributes);
      return Categories.update(categoryId, {
        $set: {
          deleted: deleteCategoryAttributes.deleted || true,
          deletedBy: deleteCategoryAttributes.deletedBy || null,
          deletedAt: deleteCategoryAttributes.deletedAt || (new Date()).toISOString(),
          updatedAt: (new Date()).toISOString(),
        }
      });
    },
  })
}
