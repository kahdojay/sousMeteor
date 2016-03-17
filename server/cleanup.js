if(Meteor.isServer){
  Meteor.methods({
    cleanupData: function(options){

      if(options === undefined){
        log.error('Missing options')
        log.debug('For example: \n\n \t Meteor.call(\'cleanupData\', {cleanup:[\'CATEGORIES\',\'TEAMS\'], teamCodes: [\'DEMO\']}) \n\n')
        return
      }

      if(
        options.hasOwnProperty('teamCodes') === false
        || (
          options.hasOwnProperty('teamCodes') === true
          && options.teamCodes.length === 0
        )
      ){
        options.teamCodes = 'all'
      }

      var teams = null;
      if(options.teamCodes === 'all'){
        teams = Teams.find({notepad:{$exists:false}}, {fields:{name:1, users:1}}).fetch();
      } else {
        teams = Teams.find({teamCode: {$in: options.teamCodes}, notepad:{$exists:false}}, {fields:{name:1, users:1}}).fetch();
      }
      var teamIds = teams.map(function(team){
        return team._id;
      });
      console.log(options, teamIds)

      var flattenUniqueArray = function(arr, oldFlat){
        var flat = oldFlat || [];
        if(_.isArray(arr)){
          arr.forEach(function(item){
            if(_.isArray(item)){
              flat = flattenUniqueArray(item, flat)
            } else {
              if(flat.indexOf(item) === -1){
                flat.push(item)
              }
            }
          }.bind(this));
        }
        return flat;
      }

      if(options.cleanup.indexOf('CATEGORIES') !== -1){
        // cleanup categories
        var categories = Categories.find({teamId: {$in:teamIds}},{fields:{name:1, products:1, teamCode: 1}}).fetch();
        categories.forEach(function(category){
          if(category.hasOwnProperty('deleted') === true && category.deleted === true){
            var removed = Categories.remove({_id:category._id});
            log.error('Removed category: ' + category.name, ' teamCode: ', category.teamCode, removed);
            return;
          }

          var filteredCategoryProducts = flattenUniqueArray(category.products);
          var categoryProducts = [];
          filteredCategoryProducts.forEach(function(productId){
            var product = Products.findOne({_id: productId});
            if(product !== undefined){
              categoryProducts.push(productId);
            } else {
              log.debug('Category: ' + category.name + ' for team: ' + category.teamCode + ' has products that do not exist.')
            }
          })
          if(categoryProducts.length === 0){
            var updatedDelete = Categories.update({_id:category._id},{
              $set:{
                deleted: true,
                deletedAt: (new Date()).toISOString(),
                updatedAt: (new Date()).toISOString(),
              }
            });
            log.error('Updated category for deletion: ' + category.name, ' teamCode: ', category.teamCode, updatedDelete);
          } else if(filteredCategoryProducts.length !== categoryProducts.length) {
            var updated = Categories.update({_id:category._id},{
              $set:{
                products: categoryProducts,
                updatedAt: (new Date()).toISOString(),
              }
            });
            log.debug('Fixed category: ' + category.name, ' teamCode: ', category.teamCode, updated);
          } else {
            log.debug('No fix necessary: ' + category.name, ' teamCode: ', category.teamCode);
          }
        });
      }

      if(options.cleanup.indexOf('TEAMS') !== -1){
        teams.forEach(function(team){
          var filteredTeamUsers = flattenUniqueArray(team.users);
          var teamUsers = [];
          filteredTeamUsers.forEach(function(userId){
            var user = Meteor.users.findOne({_id: userId});
            if(user !== undefined){
              teamUsers.push(userId);
            }
          })
          var updated = Teams.update({_id: team._id},{
            $set: {
              users: teamUsers,
              updatedAt: (new Date()).toISOString()
            }
          });
          log.debug('Fixed team: ' + team.name, updated);
        })
      }
    },

    transferPurveyorProducts: function(fromPurveyorName, toPurveyorName) {
      fromPurveyorId = Purveyors.findOne({ name: fromPurveyorName })._id
      toPurveyorId = Purveyors.findOne({ name: toPurveyorName })._id

      fromPurveyorProducts = Products.find({ purveyors: { $in: [fromPurveyorId] }}).fetch()

      fromPurveyorProducts.forEach(function(product) {
        let purveyorsArray = product.purveyors
        let toPurveyorExistingIndex = _.indexOf(purveyorsArray, toPurveyorId)
        let fromPurveyorIndex = _.indexOf(purveyorsArray, fromPurveyorId)
        if (toPurveyorExistingIndex === -1) {
          purveyorsArray[fromPurveyorIndex] = toPurveyorId
        } else {
          purveyorsArray.splice(fromPurveyorIndex, 1)
        }
        Products.update(
          { _id: product._id },
          { $set : {
            purveyors: purveyorsArray,
            updatedAt: (new Date).toISOString(),
          } }
        )
      })
    },

    relinkOrderData: function (teamCodes){
      if(teamCodes === undefined){
        teamCodes = 'all'
      } else if(teamCodes !== undefined && _.isArray(teamCodes) === false){
        teamCodes = [teamCodes]
      }
      var ret = {
        success: false,
        teamCodes: teamCodes,
        ordersCount: null,
        ordersFixed: null,
        ordersFailed: null,
        ordersOk: null
      }

      var queryOptions = {};
      if(teamCodes !== 'all'){
        var teams = Teams.find({teamCode: {$in: teamCodes}},{fields:{_id:1}}).fetch();
        var teamIds = _.map(teams, function(team){
          return team._id;
        })
        queryOptions['teamId'] = {$in: teamIds};
      }

      var allOrders = Orders.find(queryOptions).fetch();
      ret.ordersCount = allOrders.length;

      allOrders.forEach(function(order){
        var orderPurveyor = Purveyors.findOne({_id:order.purveyorId});
        var orderUpdate = {}
        var error = false;

        if(orderPurveyor === undefined){
          error = true
        } else {
          if(order.hasOwnProperty('purveyorCode') === false){
            orderUpdate.purveyorCode = orderPurveyor.purveyorCode;
          }

          var orderProducts = Object.keys(order.orderDetails.products)
          orderProducts.forEach(function(productId){
            var orderProduct = Products.find({_id: productId})
            if(orderProduct === undefined){
              error = true
            }
          })
        }

        if(error === false){
          if(Object.keys(orderUpdate).length > 0){
            orderUpdate.updatedAt = (new Date()).toISOString();
            var update = Orders.update({_id: order._id}, {$set: orderUpdate});
            log.debug('Updating order: ', update, ' with data: ', orderUpdate);
          } else {
            log.debug('Order ok! ')
          }
          ret.ordersOk = (ret.ordersOk === null) ? 1 : ret.ordersOk + 1
        } else {
          ret.ordersFailed = (ret.ordersFailed === null) ? 1 : ret.ordersFailed + 1
          log.debug('Order relink failed: ', order.id)
        }
      })

      ret.success = true

      return ret;
    },

    relinkMessagesToOrders: function(teamCodes){
      if(undefined === teamCodes){
        teamCodes = 'all';
      }
      var ret = {
        'success': null,
        'updated': {},
      }

      // get all the orders
      var orderFindOptions = {}
      if(teamCodes !== 'all'){
        if(_.isArray(teamCodes) === false){
          teamCodes = [teamCodes]
        }
        orderFindOptions = {
          teamCode: {$in: teamCodes}
        }
      }
      var allOrders = Orders.find(orderFindOptions,{sort:{orderedAt: -1}}).fetch();

      allOrders.forEach(function(order){
        // check if a message with the orderId already exists with type='order'
        var messageFindOptions = {
          type: 'order',
          orderId: order._id
        };
        var orderMessage = Messages.findOne(messageFindOptions);
        if( orderMessage === undefined){
          // get purveyor data
          var purveyor = Purveyors.findOne({_id: order.purveyorId})
          // find associated message within the hour by team, and purveyor
          var re = new RegExp(order.orderedAt.substr(0, 11))
          orderMessage = Messages.findOne({
            purveyor: purveyor.name,
            teamId: order.teamId,
            createdAt: re,
            orderId: {$exists: false},
          });
          if(orderMessage !== undefined){
            // update the message with the orderId
            ret.updated[order._id] = Messages.update({_id: orderMessage._id}, {$set: {
              orderId: order._id,
              updatedAt: (new Date()).toISOString(),
            }});
            log.debug('SUCCESSFULLY linked message to order: ', order._id)
          } else {
            log.error('Cannot find message for order: ', order._id)
          }
        } else {
          log.debug('Order already contains linked message: ', order._id)
        }
      })

      return ret;
    },
  })
}
