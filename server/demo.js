if(Meteor.isServer){
  Meteor.methods({
    resetDemoData: function(resetProducts) {
      var updateProducts = (resetProducts === true) ? true : false
      var status = {
        demoTeam: null,
        remove: {},
        import: {},
        remove: {},
        update: {},
      };
      status.demoTeam = Teams.findOne({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});

      // status.remove.purveyors = Purveyors.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // status.remove.products = Products.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // status.remove.categories = Categories.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // status.remove.orders = Orders.remove({teamId: status.demoTeam._id});
      // status.remove.cartItems = CartItems.remove({teamId: status.demoTeam._id});

      status.remove.messages = Messages.remove({teamId: status.demoTeam._id});
      status.update.tasks = Teams.update({_id: status.demoTeam._id}, {$set:{
        tasks:[],
        deleted: false,
        updatedAt: (new Date()).toISOString(),
      }})

      status.import.messages = Meteor.call('importMessages', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.DEMO_MESSAGES);
      status.import.teamTasks = Meteor.call('importTeamTasks', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.DEMO_TASKS);
      status.import.purveyors = Meteor.call('importPurveyors', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.PURVEYORS);
      if(updateProducts === true){
        status.import.products = Meteor.call('importProducts', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.DEMO_PRODUCTS);
      } else {
        log.debug("\n\n ------ SKIPPING PRODUCT IMPORT ------ \n\n");
      }

      // if(status.import.messages.length > 0){
      //   var hoursIndex = [12, 12, 12, 12, 13, 13]
      //   var minutesIndex = [13, 15, 16, 30, 37, 38]
      //   var demoMessages = Messages.find({teamId: demoTeam._id},{sort:{createdAt: 1}}).fetch()
      //
      //   demoMessages.forEach(function(message, idx) {
      //     var newCreatedAt = new Date(message.createdAt)
      //     newCreatedAt.setHours(hoursIndex[idx])
      //     newCreatedAt.setMinutes(minutesIndex[idx])
      //     Messages.update({_id: message._id}, {$set: {
      //       createdAt: newCreatedAt.toISOString(),
      //       updatedAt: newCreatedAt.toISOString(),
      //     }})
      //   })
      // }

      return status;
    },

    importSousDemoProducts: function() {
      return Meteor.call('importProducts', 'DEMO', undefined, Meteor.settings.SHEETSU.DEMO_PRODUCTS)
    },

    createDemoTeam: function(userId, teamId) {
      log.debug("CREATING DEMO TEAM - userId: ", userId, ' teamId: ', teamId);
      var ret = {
        success: false,
        userId: userId,
        teamId: teamId,
        import: {},
      }

      var team = Teams.findOne({_id: teamId});

      ret.import.purveyors = Meteor.call('importPurveyors', Meteor.settings.APP.DEMO_TEAMCODE, team.teamCode, Meteor.settings.SHEETSU.DEMO_PURVEYORS);
      ret.import.products = Meteor.call('importProducts', Meteor.settings.APP.DEMO_TEAMCODE, team.teamCode, Meteor.settings.SHEETSU.DEMO_PRODUCTS);
      ret.import.teamTasks = Meteor.call('importTeamTasks', Meteor.settings.APP.DEMO_TEAMCODE, team.teamCode, Meteor.settings.SHEETSU.DEMO_TASKS);

      ret.success = true;

      return ret;
    },
  })
}
