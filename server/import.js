if(Meteor.isServer){
  Meteor.methods({

    importMessages: function(importTeamCode, teamCodeOverride, url) {
      if(undefined === importTeamCode){
        importTeamCode = 'all';
      }
      var ret = {
        'messages': {}
      }
      var response = Meteor.http.get(url, {timeout: 10000});
      var newMessages = response.data.result
      newMessages.forEach(function(message, idx) {
        if(message.hasOwnProperty('teamCode') === false){
          ret.messages[message._id] = 'Missing teamCode.';
          return false
        }
        if(message.hasOwnProperty('process') === false){
          message.process = 'FALSE';
        }
        if(message.process === 'FALSE'){
          ret.messages[message._id] = 'Process flag: ' + message.process;
          return false;
        }

        if(importTeamCode !== undefined && importTeamCode !== 'all'){
          if(message.teamCode !== importTeamCode){
            log.debug('Skipping teamCode: ' + message.teamCode);
            return false;
          }
        }

        var messageAttributes = {
          createdAt: (new Date()).toISOString(),
        };

        if(message.hasOwnProperty('createdHourMinute') && message.createdHourMinute !== ''){
          var newCreatedAt = new Date(messageAttributes.createdAt)
          var hoursMinsArray = message.createdHourMinute.split(':')
          newCreatedAt.setHours(hoursMinsArray[0])
          newCreatedAt.setMinutes(hoursMinsArray[1])
          messageAttributes.createdAt = newCreatedAt.toISOString();
        }

        if(message.hasOwnProperty('type') && message.type !== ''){
          messageAttributes.type = message.type;
        }

        if(message.hasOwnProperty('purveyor') && message.purveyor !== ''){
          messageAttributes.purveyor = message.purveyor;
        }

        if(message.hasOwnProperty('message') && message.message !== ''){
          messageAttributes.message = message.message;
        }

        var userId = null
        if(message.hasOwnProperty('teamCode') && message.teamCode !== ''){
          var teamCode = message.teamCode;
          if(teamCodeOverride){
            teamCode = teamCodeOverride
          }
          var team = Teams.findOne({teamCode: teamCode},{fields:{teamCode:1, users:1}});
          log.debug('TEAMID: ', team._id);
          messageAttributes.teamId = team._id;
          if(teamCodeOverride && message.hasOwnProperty('teamId') && message.teamId !== ''){
            message.teamId = team._id;
          }
          // userId = team.users[0];
        }

        if(message.hasOwnProperty('userId') && message.userId !== ''){
          messageAttributes.userId = message.userId;
        } else {
          messageAttributes.userId = userId;
        }

        if(message.hasOwnProperty('author') && message.author !== ''){
          messageAttributes.author = message.author;
        }

        if(message.hasOwnProperty('teamId') && message.teamId !== ''){
          messageAttributes.teamId = message.teamId;
        }

        if(message.hasOwnProperty('imageUrl') && message.imageUrl !== ''){
          messageAttributes.imageUrl = message.imageUrl;
        }

        if(!teamCodeOverride && message.hasOwnProperty('_id') && message._id !== ''){
          messageAttributes._id = message._id;
        }

        log.debug('CREATE MSG -- ATTRS', messageAttributes)

        ret.messages[message._id] = Meteor.call('createMessage', messageAttributes, false);
      })

      return ret;
    },

    importTeams: function(url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.TEAMS
      }
      var ret = {
        'before': null,
        'teams': {},
        'after': null
      }
      ret.before = Teams.find().count();

      var response = Meteor.http.get(url, {timeout: 10000});
      var newTeams = response.data.result
      newTeams.forEach(function(team, idx) {
        if(team.hasOwnProperty('teamCode') === false){
          ret.teams[idx] = 'Missing teamCode.';
          return false
        }
        if(team.hasOwnProperty('process') === false){
          team.process = 'FALSE';
        }
        if(team.process === 'FALSE'){
          ret.teams[team.teamCode] = 'Process flag: ' + team.process;
          return false;
        }

        var orderEmails = team.orderEmails;
        if(Meteor.settings.APP.ENV !== 'production'){
          orderEmails = Meteor.settings.APP.SOUS_EMAIL;
        }

        var demoTeam = false;
        if(team.teamCode === Meteor.settings.APP.DEMO_TEAMCODE){
          demoTeam = true;
        }

        if(team.hasOwnProperty('betaAccess') === true){
          var teamBetaAccess = _.map(team.betaAccess.split(','), _.trim);
          team.betaAccess = _.zipObject(teamBetaAccess, Array(team.betaAccess.length).fill(true));
        } else {
          team.betaAccess = {};
        }

        Teams.update(
          {teamCode: team.teamCode},
          {
            $set: Object.assign(team, {
              demoTeam: demoTeam,
              orderEmails: orderEmails,
              updatedAt: (new Date()).toISOString()
            }),
            $setOnInsert: {
              tasks: [],
              users: [],
              cart: EMPTY_CART, // TODO: remove this after all data transition to CartItems
              deleted: false,
              createdAt: (new Date()).toISOString()
            }
          },
          {upsert:true}
        );
        ret.teams[team.teamCode] = true;
      });

      ret.after = Teams.find().count();
      return ret;
    },

    importUsers: function(url) {
      var ret = {
        'before': null,
        'users': {},
        'after': null
      }
      ret.before = Meteor.users.find().count();

      var response = Meteor.http.get(url, {timeout: 10000});
      var newUsers = response.data.result
      newUsers.forEach(function(u) {
        if(u.hasOwnProperty('process') === false){
          u.process = 'FALSE';
        }
        if(u.process === 'FALSE'){
          ret.users[u.username] = 'Process flag: ' + u.process;
          return false;
        }
        if(u.username === ''){
          ret.users[u.email || u.firstName + ' ' + u.lastName] = 'Missing username...';
          return false;
        }
        log.debug(u)
        var userPkg = Meteor.call('getUserByPhoneNumber', u.username);
        var user = userPkg.user;

        // update user with some default data
        Meteor.users.update({_id: userPkg.userId}, {$set: {
          email: u.email,
          phone: u.phone || u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          superUser: (u.hasOwnProperty('superUser') === true && u.superUser === 'TRUE' ) ? true : false,
          imageUrl: (u.hasOwnProperty('imageUrl') === true) ? u.imageUrl : '',
          updatedAt: (new Date()).toISOString(),
        }})

        // associate with teams
        teams = u.teamCodes.replace(/^\s+|\s+$/g,"").split(/\s*,\s*/)
        var addDemoTeam = false;
        if(teams.indexOf(Meteor.settings.APP.DEMO_TEAMCODE) === -1){
          addDemoTeam = true;
        }
        if(u.hasOwnProperty('demoUser') && u.demoUser === 'FALSE'){
          addDemoTeam = false;
        }
        if(addDemoTeam === true){
          teams.push(Meteor.settings.APP.DEMO_TEAMCODE);
        }
        teams.forEach(function(teamCode) {
          log.debug(`adding ${u.firstName} to ${teamCode}`)
          var userTeams = Teams.find({users:{$in:[userPkg.userId]}}, {fields:{teamCode:1}}).fetch();
          var teamCodeFound = false;
          userTeams.forEach(function(team){
            if(team.teamCode === teamCode){
              teamCodeFound = true;
            }
          });
          if(teamCodeFound === false){
            // find the team, add user
            Teams.update(
              { teamCode: teamCode },
              {
                $push: { users: userPkg.userId },
                $set: {
                  deleted: false,
                  updatedAt: (new Date()).toISOString()
                }
              }
            );
          }
        })

        ret.users[u.username] = true;
      });

      ret.after = Meteor.users.find().count();
      return ret;
    },

    importPurveyors: function(teamCode, teamCodeOverride, url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.PURVEYORS
      }
      if(undefined === teamCode){
        teamCode = 'all';
      }
      var ret = {
        'before': null,
        'purveyors': {},
        'after': null
      }
      ret.before = Purveyors.find().count();

      // insert purveyors with purveyorCode
      var response = Meteor.http.get(url, {timeout: 10000})
      log.debug('importPurveyors response:', response.data.result)
      response.data.result.forEach(function(purveyor) {
        if(purveyor.hasOwnProperty('teamCode') === false){
          ret.purveyors[purveyor.teamCode] = 'Missing teamCode';
          return false;
        }
        if(purveyor.hasOwnProperty('process') === false){
          purveyor.process = 'FALSE';
        }
        if(purveyor.process === 'FALSE'){
          ret.purveyors[purveyor.teamCode] = 'Process flag: ' + purveyor.process;
          return false;
        }

        if(teamCode !== undefined && teamCode !== 'all'){
          if(purveyor.teamCode !== teamCode){
            log.debug('Skipping teamCode: ' + purveyor.teamCode);
            return false;
          }
        }

        if(teamCodeOverride){
          purveyor.teamCode = teamCodeOverride
          purveyor._id = Purveyors._makeNewID();
          purveyor.purveyorCode = `${purveyor.purveyorCode}-${teamCodeOverride}`
        }

        ret.purveyors[purveyor.teamCode] = Meteor.call('importPurveyorsData', purveyor);
      });

      ret.after = Purveyors.find().count();
      return ret;
    },

    importPurveyorsData: function(purveyor) {

      var teamId = Teams.findOne({teamCode: purveyor.teamCode},{fields:{_id:1}});
      if(teamId === undefined){
        log.info('Unable to locate team for: ' + purveyor.teamCode);
        return false;
      } else {
        teamId = teamId._id;
      }

      var orderEmails = purveyor.orderEmails;
      if(Meteor.settings.APP.ENV !== 'production' && purveyor.teamCode !== Meteor.settings.APP.DEMO_TEAMCODE){
        orderEmails = Meteor.settings.APP.ORDER_EMAIL;
      }

      var purveyorLookup = { purveyorCode: purveyor.purveyorCode, teamId: teamId, };
      if(purveyor.hasOwnProperty('_id') === true){
        purveyorLookup = { _id: purveyor._id, teamId: teamId, };
      }

      var purveyorUpdate = {
        $set: {
          purveyorCode: purveyor.purveyorCode,
          teamId: teamId,
          teamCode: purveyor.teamCode,
          name: purveyor.name,
          company: purveyor.company,
          city: purveyor.city,
          state: purveyor.state,
          zipCode: purveyor.zipCode,
          timeZone: purveyor.timeZone,
          orderCutoffTime: purveyor.orderCutoffTime,
          orderMinimum: purveyor.orderMinimum,
          deliveryDays: purveyor.deliveryDays,
          notes: purveyor.notes,
          email: purveyor.email,
          orderEmails: orderEmails,
          phone: purveyor.phone,
          orderContact: purveyor.orderContact,
          description: purveyor.description,
          sendEmail: (purveyor.sendEmail === "TRUE" ? true : false),
          sendSMS: (purveyor.sendSMS === "TRUE" ? true : false),
          sendFax: (purveyor.sendFax === "TRUE" ? true : false),
          fax: purveyor.fax,
          uploadToFTP: (purveyor.uploadToFTP === "TRUE" ? true : false),
          sheetsu: purveyor.sheetsu || '',
          imageUrl: purveyor.imageUrl,
          deleted: (purveyor.action === "REMOVE" ? true : false),
          updatedAt: (new Date()).toISOString()
        },
        $setOnInsert: {
          createdAt: (new Date()).toISOString()
        }
      };

      if(purveyor.hasOwnProperty('_id') === true){
        purveyorUpdate.$setOnInsert._id = purveyor._id
      }

      // upsert the purveyor
      Purveyors.update(
        purveyorLookup,
        purveyorUpdate,
        { upsert: true },
        Meteor.bindEnvironment(function() {
          log.info('Successfully imported: ' + purveyor.name)
        })
      )
      return true;
    },

    importProducts: function(importTeamCode, teamCodeOverride, url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.PRODUCTS
      }
      if(undefined === importTeamCode){
        importTeamCode = 'all';
      }

      log.debug("importProducts METHOD ARGUMENTS: ", importTeamCode, teamCodeOverride, url);

      var ret = {
        teamCode: importTeamCode,
        'before': null,
        'products': {
          success: 0,
          errorProcess: 0,
          errorTeamCode: 0
        },
        'after': null,
        'removedCategories': null,
      }
      ret.before = Products.find().count();

      var response = Meteor.http.get(url, {timeout: 10000})
      // log.debug('importProducts response:', response)
      // get all purveyors
      var resultsLength = response.data.result.length;
      response.data.result.forEach(function(productRow, productRowIdx) {
        log.debug(`\n\n\n\n PROCESSING ${(productRowIdx+1)} of ${resultsLength} \n\n`)
        if(productRow.hasOwnProperty('process') === true && productRow.process === 'FALSE'){
          ret.products.errorProcess += 1;
          return false;
        }
        if(productRow.hasOwnProperty('teamCode') === false){
          ret.products.errorTeamCode += 1;
          return false;
        }

        if(importTeamCode !== undefined && importTeamCode !== 'all'){
          if(productRow.teamCode !== importTeamCode){
            log.debug('Skipping teamCode: ', productRow.teamCode);
            return false;
          }
        }

        var teamCode = productRow.teamCode;
        if(teamCodeOverride){
          teamCode = teamCodeOverride
          productRow.teamCode = teamCodeOverride
          delete productRow._id
        }

        var teamId = Teams.findOne({teamCode: teamCode},{fields:{_id:1}});
        if(teamId === undefined){
          return false
        } else {
          teamId = teamId._id;
        }

        var purveyorCodes = productRow.purveyors.split(',');
        var purveyors = []
        purveyorCodes.forEach(function(purveyorCode) {
          purveyorCode = _.trim(purveyorCode)
          if(teamCodeOverride){
            purveyorCode = `${purveyorCode}-${teamCodeOverride}`
          }
          purveyor = Purveyors.findOne({ purveyorCode: purveyorCode, teamCode: teamCode });
          if(purveyor !== undefined){
            log.debug('PURVEYOR ID: ', purveyor._id);
            purveyors.push(purveyor._id);
          } else {
            log.debug('PURVEYOR NOT FOUND: ', purveyorCode);
          }
        })

        log.debug('SETTING PURVEYORS: ', purveyors)

        var productAction = 'UPDATE';
        if(productRow.hasOwnProperty('action') === true && productRow.action !== ''){
          productAction = productRow.action;
        }

        if(productAction === 'REMOVE'){
          if(productRow.hasOwnProperty('_id') === true){
            Products.update({ _id: productRow._id }, {$set: {
              deleted: true,
              updatedAt: (new Date()).toISOString(),
              deletedAt: (new Date()).toISOString(),
            }});
            // NOTE: Requires client side to be able to respond to the flag
            var singleProductCategory = Categories.findOne({products:{$in:[productRow._id]}});
            if(singleProductCategory !== undefined){
              var updatedProducts = singleProductCategory.products;
              var productIdx = updatedProducts.indexOf(productRow._id);
              if(productIdx !== -1){
                updatedProducts = singleProductCategory.products.slice(0, productIdx);
                updatedProducts = updatedProducts.concat(singleProductCategory.products.slice(productIdx+1));
              }
              Categories.update({_id: singleProductCategory._id},{$set:{
                products: updatedProducts,
                updatedAt: (new Date()).toISOString()
              }});
            }
          } else {
            log.debug('UNABLE TO REMOVE PRODUCT - missing _id: ', productRow)
          }
        } else {

          var newProductAttributes = {
            name: productRow.name,
            teamId: teamId,
            teamCode: productRow.teamCode,
            description: productRow.description,
            price: productRow.price,
            purveyors: purveyors,
            amount: productRow.amount,
            unit: productRow.unit,
            par: productRow.par,
            sku: productRow.sku ? productRow.sku.toString() : '',
            packSize: productRow.packSize || '',
            deleted: false,
            createdAt: (new Date()).toISOString(),
            updatedAt: (new Date()).toISOString()
          };

          if(productRow.hasOwnProperty('_id') === true){
            newProductAttributes._id = productRow._id;
          } else {
            newProductAttributes._id = Products._makeNewID();
          }

          var productLookup = { name: productRow.name, teamId: teamId };
          if(newProductAttributes.hasOwnProperty('_id') === true && newProductAttributes._id !== '#N/A' && newProductAttributes._id !== ''){
            productLookup = { _id: newProductAttributes._id, teamId: teamId };
          }

          log.debug('Product lookup: ', productLookup);

          var productResult = Meteor.call('createProduct', newProductAttributes, productLookup);
          log.debug('productResult: ', productResult);
          if (productRow.category !== '') {
            log.debug('updating productRow category:', productRow.category);

            var categoryLookup = { name: productRow.category, teamId: teamId};
            var category = Categories.findOne(categoryLookup);
            if(category === undefined){
              var categoryAttributes = {
                name: productRow.category,
                teamId: teamId,
                teamCode: productRow.teamCode,
                products: [newProductAttributes._id],
                deleted: false,
                createdAt: (new Date()).toISOString(),
                updatedAt: (new Date()).toISOString()
              };
              var categoryResult = Meteor.call('createCategory', categoryAttributes, categoryLookup);
              log.debug('categoryResult: ', categoryResult)
              category = categoryResult.category;
            }

            var addProductCategoryResult = Meteor.call('addProductCategory', categoryLookup, newProductAttributes._id);

          } // end if productRow.category is not blank

        }
        ret.products.success += 1;
      }); // end response.data.result.forEach

      ret.after = Products.find().count();
      ret.removedCategories = Categories.remove({products: {$size: 0}});
      return ret;
    },

    importTeamTasks: function(importTeamCode, teamCodeOverride, url) {
      if(undefined === importTeamCode){
        importTeamCode = 'all';
      }
      var ret = {
        'tasks': {}
      }
      var response = Meteor.http.get(url, {timeout: 10000});
      var newTeamTasks = response.data.result
      newTeamTasks.forEach(function(task, idx) {
        if(task.hasOwnProperty('teamCode') === false){
          ret.tasks[task.recipeId] = 'Missing teamCode.';
          return false
        }
        if(task.hasOwnProperty('process') === false){
          task.process = 'FALSE';
        }
        if(task.process === 'FALSE'){
          ret.tasks[task.recipeId] = 'Process flag: ' + task.process;
          return false;
        }

        if(importTeamCode !== undefined && importTeamCode !== 'all'){
          if(task.teamCode !== importTeamCode){
            log.debug('Skipping teamCode: ' + task.teamCode);
            return false;
          }
        }

        var teamId = null;
        var userId = null;
        if(task.hasOwnProperty('teamCode') && task.teamCode !== ''){
          var teamCode = task.teamCode;
          if(teamCodeOverride){
            teamCode = teamCodeOverride
          }
          var team = Teams.findOne({teamCode: teamCode},{fields:{teamCode:1,users:1}});
          teamId = team._id;
          userId = team.users[0]
        }

        var taskAttributes = {
          recipeId: task.recipeId,
          name: task.name,
          description: task.description.replace('\n',"\n"),
          deleted: (task.deleted === 'TRUE' ? true : false),
          completed: (task.completed === 'TRUE' ? true : false),
          quantity: parseInt(task.quantity),
          unit: task.unit ? parseInt(task.unit) : 0,
        }
        taskAttributes.unit = taskAttributes.unit || 0;

        ret.tasks[task.recipeId] = Meteor.call('addTeamTask', userId, teamId, taskAttributes)
      })

      return ret;

    },

    importTeamPurveyorSettings: function(teamCode, url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.TEAM_PURVEYOR_SETTINGS
      }
      if(undefined === teamCode){
        teamCode = 'all';
      }
      var ret = {
        'before': null,
        'settings': {},
        'after': null
      }
      ret.before = TeamPurveyorSettings.find().count();
      var teams = {};
      var purveyors = {};

      // insert purveyors with purveyorCode
      var response = Meteor.http.get(url, {timeout: 10000})
      log.debug('importTeamPurveyorSettings response:', response.data.result)
      response.data.result.forEach(function(teamPurveyorSetting) {
        if(teamPurveyorSetting.hasOwnProperty('teamCode') === false){
          ret.settings[teamPurveyorSetting.teamCode] = 'Missing teamCode';
          return false;
        }

        if(teamCode !== undefined && teamCode !== 'all'){
          if(teamPurveyorSetting.teamCode !== teamCode){
            log.debug('Skipping teamCode: ' + teamPurveyorSetting.teamCode);
            return false;
          }
        }

        if(teamPurveyorSetting.hasOwnProperty('purveyorCode') === false){
          ret.settings[teamPurveyorSetting.teamCode] = 'Missing purveyorCode';
          return false;
        }

        if(teams.hasOwnProperty(teamPurveyorSetting.teamCode) === false){
          var team = Teams.findOne({teamCode: teamPurveyorSetting.teamCode})
          if(team){
            teams[teamPurveyorSetting.teamCode] = team;
          } else {
            ret.settings[teamPurveyorSetting.teamCode] = 'Can not find teamCode: ' + teamPurveyorSetting.teamCode;
            return false;
          }
        }

        if(purveyors.hasOwnProperty(teamPurveyorSetting.purveyorCode) === false){
          var purveyor = Purveyors.findOne({purveyorCode: teamPurveyorSetting.purveyorCode})
          if(purveyor){
            purveyors[teamPurveyorSetting.purveyorCode] = purveyor;
          } else {
            ret.settings[teamPurveyorSetting.teamCode] = 'Can not find purveyorCode: ' + teamPurveyorSetting.purveyorCode;
            return false;
          }
        }

        var teamPurveyorSettingLookup = {
          teamCode: teamPurveyorSetting.teamCode,
          purveyorCode: teamPurveyorSetting.purveyorCode,
        }

        var updateSettings = {
          teamId: teams[teamPurveyorSetting.teamCode]._id,
          teamCode: teamPurveyorSetting.teamCode,
          purveyorId: purveyors[teamPurveyorSetting.purveyorCode]._id,
          purveyorCode: teamPurveyorSetting.purveyorCode,
        }
        updateSettings[`${teamPurveyorSetting.groupKey}.${teamPurveyorSetting.key}`] = teamPurveyorSetting.value;
        ret.settings[teamPurveyorSetting.teamCode] = TeamPurveyorSettings.update(teamPurveyorSettingLookup, {$set: updateSettings}, {upsert:true});
      });

      ret.after = TeamPurveyorSettings.find().count();
      return ret;
    },
  })
}
