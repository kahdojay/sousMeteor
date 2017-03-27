if(Meteor.isServer){
  Meteor.methods({

    getTeamByCode: function(teamCode) {
      return Teams.findOne({teamCode: teamCode});
    },

    createTeam: function(teamAttributes, userId) {
      log.debug("TEAM ATTRS", teamAttributes);
      var team = Teams.findOne({_id: teamAttributes._id, name: teamAttributes.name});
      var user = Meteor.users.findOne({ _id: userId });
      if(team === undefined){
        if(teamAttributes.hasOwnProperty('createdAt') === false){
          teamAttributes.createdAt = (new Date()).toISOString();
        }

        var messageType = 'welcome'

        if(teamAttributes.demoTeam){
          teamAttributes.name = teamAttributes.name.replace('Team', 'Demo Team')
          teamAttributes.teamCode = `${teamAttributes.teamCode}DEMO${Math.floor(1000 + Math.random() * 9999)}`
          messageType = 'demo-welcome'
          teamAttributes.phone = user.username
          teamAttributes.address = '123 Main St.'
          teamAttributes.city = 'City'
          teamAttributes.state = 'ST'
          teamAttributes.zipCode = '00000'
        }
        teamAttributes.allowedUserCount = 10

        // TODO: remove this after all data transition to CartItems
        teamAttributes.cart = EMPTY_CART;
        teamAttributes.updatedAt = (new Date()).toISOString();
        var teamId = Teams.insert(teamAttributes);
        var messageAttributes = {
            type: messageType,
            author: 'Sous',
            teamId: teamId,
            createdAt: (new Date()).toISOString(),
            imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
            message: 'Welcome to Sous!'
          }
        // TODO: Refactor to use common message library
        Messages.insert(messageAttributes)

        if(teamAttributes.demoTeam){
          Meteor.call('createDemoTeam', userId, teamId);
        }

        var team = Teams.findOne({_id: teamId});
        log.debug("CREATED TEAM", team);
      } else {
        log.error("Team already exists");
        // TODO: publish an error
      }
    },

    updateTeam: function(teamId, teamAttributes) {
      var originalTeamAttrs = JSON.stringify(teamAttributes, null, 2);
      log.debug("UPDATE TEAM ATTRS", originalTeamAttrs);
      var realTeamId = {_id: teamId};
      if(teamAttributes.hasOwnProperty('users') === true){
        delete teamAttributes.users;
        var team = Teams.findOne({_id: teamId}, {fields: {name: 1, teamCode: 1, users: 1}})
        var teamAttrsString = "```" + originalTeamAttrs + "```"
        var teamString = "```" + JSON.stringify(team, null, 2) + "```"
        slack.alert({
          username: 'errorBot',
          channel: '#dev-errors',
          icon_emoji: ':boom:',
          text: `Team attributes affecting ${teamId} - \n Replace USER Attrs: \n ${teamAttrsString} \n Team USER Attrs Safe: \n ${teamString}`,
          attachments: null
        });
      }
      teamAttributes.updatedAt = (new Date()).toISOString();
      return Teams.update(realTeamId, {$set: teamAttributes});
    },

    addTeamTask: function(userId, teamId, taskAttributes) {
      var ret = {
        'success': null
      }
      var realTeamId = {_id: teamId};
      log.debug("TEAM ID ", teamId);
      log.debug("TASK ATTRS ", taskAttributes);
      var teamHasTask = Teams.findOne({_id: teamId, "tasks.name": taskAttributes.name},{id:1})
      log.debug("TEAM ALREADY HAS TASK: ", (teamHasTask !== undefined ? true : false));
      if(teamHasTask === undefined){
        var update = Recipes.update(
          {_id:taskAttributes.recipeId},
          {
            $set: {
              name: taskAttributes.name,
              updatedAt: (new Date()).toISOString(),
            },
            $setOnInsert: {
              _id: taskAttributes.recipeId,
              ingredients: [], // for future use
              createdAt: (new Date()).toISOString(),
            }
          }
        );
        Teams.update(realTeamId, {
          $push: {tasks: taskAttributes},
          $set: {updatedAt: (new Date()).toISOString()}
        });
        ret.success = true
      } else {
        Meteor.call('triggerError',
          'add-error',
          'Team task already exists',
          userId
        )
        ret.success = false;
      }
      return ret
    },

    updateTeamTask: function(teamId, recipeId, taskAttributes){
      log.debug("TEAM ID ", teamId);
      log.debug("RECIPE ID ", recipeId);
      log.debug("TASK ATTRS ", taskAttributes);
      var realTeamId = {_id: teamId};
      var team = Teams.findOne(realTeamId);
      if(team){
        // needed to add: meteor add maxharris9:object-assign
        // var taskIdx = _.findIndex(team.tasks, function(task) {
        //   return task.recipeId === recipeId
        // });
        var taskIdx;
        // log.debug("TEAM", team);
        team.tasks.forEach(function(task, index) {
          if (task.recipeId == recipeId)
            taskIdx = index;
        });
        team.tasks[taskIdx] = Object.assign({}, team.tasks[taskIdx], taskAttributes);
        Teams.update(realTeamId, {
          $set: {
            tasks: team.tasks,
            updatedAt: (new Date()).toISOString(),
          }
        });
      }
      team = Teams.findOne({_id: teamId});
      log.debug("UPDATED TEAM", team);
    },

    getTeamUsers: function(userId, teamId){
      log.debug("GET TEAM USERS - userId: ", userId, " teamId: ", teamId);
      var requestor = Meteor.users.findOne({_id: userId},{fields: {superUser:1}});
      if(requestor){
        var teamsUsers = Teams.findOne({_id: teamId},{fields:{users:1}})
        var findFilter = {
          _id: {$in: teamsUsers.users},
        }

        if(requestor.superUser !== true){
          findFilter.superUser = false
        }

        return Meteor.users.find(findFilter, {
          fields: {
            firstName: 1,
            lastName: 1,
            username: 1,
            superUser: 1,
            imageUrl: 1,
            username: 1,
            email: 1,
            updatedAt: 1,
            imagedChangedAt: 1,
            oneSignalId: 1
          }
        }).fetch();
      } else {
        return []
      }
    },

    getTeamOrderGuide: function(teamId) {
      log.debug("GET TEAM ORDER GUIDE - teamId: ", teamId);
      var ret = {
        purveyors: Purveyors.find({teamId: {$in: [teamId]}}).fetch(),
        categories: Categories.find({teamId: {$in: [teamId]}}).fetch(),
        products: Products.find({teamId: {$in: [teamId]}}).fetch(),
      }
      return ret;
    },

    getTeamBetaAccess(userId, teamId) {
      log.debug("GET TEAM BETA ACCESS - userId: ", userId, " teamId: ", teamId);
      var ret = {
        meta: {
          start: (new Date()).getTime(),
          end: null,
          processing: null,
        },
        betaAccess: {}
      }

      var betaAccess = Teams.findOne({_id: teamId},{fields:{betaAccess:1}})
      ret.betaAccess = betaAccess.betaAccess || {}

      ret.meta.end = (new Date()).getTime()
      ret.meta.processing = ret.meta.end - ret.meta.start;

      return ret;
    },

    getTeamResourceInfo(userId, teamId) {
      log.debug("GET TEAM RESOURCES - userId: ", userId, " teamId: ", teamId);
      var ret = {
        meta: {
          start: (new Date()).getTime(),
          end: null,
          processing: null,
          retrievedAt: null,
        },
        counts: {
          purveyors: null,
          categories: null,
          products: null,
          orders: null,
          cartItems: null,
        },
        lastUpdated: {
          purveyors: null,
          categories: null,
          products: null,
          orders: null,
          cartItems: null,
        },
      }

      ret.counts.products = Products.find({teamId: teamId}).count();
      ret.counts.purveyors = Purveyors.find({teamId: teamId}).count();
      ret.counts.categories = Categories.find({teamId: teamId}).count();
      ret.counts.orders = Orders.find({teamId: teamId}).count();
      ret.counts.cartItems = CartItems.find({teamId: teamId}).count();

      ret.lastUpdated.products = (ret.counts.products > 0) ? Products.findOne({teamId: teamId},{fields: {updatedAt: 1}, sort:{updatedAt: -1}}).updatedAt : null;
      ret.lastUpdated.purveyors = (ret.counts.purveyors > 0) ? Purveyors.findOne({teamId: teamId},{fields: {updatedAt: 1}, sort:{updatedAt: -1}}).updatedAt : null;
      ret.lastUpdated.categories = (ret.counts.categories > 0) ? Categories.findOne({teamId: teamId},{fields: {updatedAt: 1}, sort:{updatedAt: -1}}).updatedAt : null;
      ret.lastUpdated.orders = (ret.counts.orders > 0) ? Orders.findOne({teamId: teamId},{fields: {updatedAt: 1}, sort:{updatedAt: -1}}).updatedAt : null;
      ret.lastUpdated.cartItems = (ret.counts.cartItems > 0) ? CartItems.findOne({teamId: teamId},{fields: {updatedAt: 1}, sort:{updatedAt: -1}}).updatedAt : null;

      ret.meta.end = (new Date()).getTime()
      ret.meta.processing = ret.meta.end - ret.meta.start;
      ret.meta.retrievedAt = (new Date()).toISOString();

      return ret;
    },

    deleteTeam: function(teamId, userId) {
      log.debug("DELETE TEAM", teamId);
      Teams.update(teamId, {
        $set: {
          deleted: true,
          updatedAt: (new Date()).toISOString(),
          deletedAt: (new Date()).toISOString(),
          deletedBy: userId,
        }
      });
    },
  })
}
