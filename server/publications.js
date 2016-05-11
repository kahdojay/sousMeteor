function getTeamsUsersIds(teamIds) {
  var teamUsers = Teams.find({_id: {$in: teamIds}}, {
    fields: {
      users: 1
    }
  }).fetch();
  var userIds = {}
  teamUsers.forEach(function(team){
    team.users.forEach(function(userId){
      userIds[userId] = true;
    }.bind(this))
  }.bind(this));
  return userIds;
}

function filterUserIds(userId, teamsUsersIds){
  var currentUser = Meteor.users.findOne({_id: userId},{fields:{superUser:1}});
  var teamsUsers = Meteor.users.find({
    _id: {$in: teamsUsersIds}
  }, {
    fields: {
      _id: 1,
      superUser: 1
    }
  }).fetch();

  // for the superUsers, show all teamsUsers
  if(currentUser.hasOwnProperty('superUser') && currentUser.superUser === true){
    var filteredUserIds = teamsUsers;
  }
  // everyone else filter out the superUsers
  else {
    var filteredUserIds = teamsUsers.filter(function(user){
      if(user.hasOwnProperty('superUser') && user.superUser === true){
        return false;
      }
      return true;
    })
  }
  var userIds = filteredUserIds.map(function(user){
    return user._id;
  })
  return userIds;
}

function updateUserSettings(userId){
  var userSettings = Settings.findOne({userId: userId})
  if(!userSettings){
    Settings.insert({userId: userId, lastSubscribedAt: (new Date()).toISOString()});
  } else {
    Settings.update({userId: userId}, {$set:{
      lastSubscribedAt: (new Date()).toISOString(),
    }})
  }
}

Meteor.publish('messages', function(userId, teamId, sinceCreatedAt) {
  // Meteor.call('updateInstallation', userId, {"badge": 0});
  if(sinceCreatedAt === undefined){
    sinceCreatedAt = (new Date()).toISOString();
  }
  var messagesQuery = {
    teamId: teamId,
    createdAt: { $gte: sinceCreatedAt }
  };
  var messagesOptions = {
    sort: {teamId: 1, createdAt: -1}
  };
  // console.log('SUBSCRIBE TO MESSAGES FOR: ', userId, ' USING: ', messagesQuery, messagesOptions);
  return Messages.find(messagesQuery, messagesOptions);
}.bind(this));

Meteor.publish('teams-users', function(userId, teamIds, teamsUsersIds){
  if(!teamsUsersIds){
    teamsUsersIdsMap = getTeamsUsersIds(teamIds);
    teamsUsersIds = Object.keys(teamsUsersIdsMap);
  }
  var userIds = filterUserIds(userId, teamsUsersIds);
  return Meteor.users.find({
    _id: {$in: userIds},
  }, {
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
    }
  });
}.bind(this));

Meteor.publish('teams', function(userId) {
  updateUserSettings(userId)
  var query = {
    users: {$in: [userId]},
    notepad: {$exists: false},
    updatedAt: {$gte: (new Date((new Date).getTime() - (1000*60*60))).toISOString()},
  }
  // return allTeams;
  return Teams.find(query)
  // var allTeamIds = allTeams.map(function(team){
  //   return team._id;
  // })
  // return Teams.find({_id: {$in: allTeamIds}});
});

Meteor.publish('purveyors', function(userId, teamIds) {
  var query = {
    teamId: {$in: teamIds},
    updatedAt: {$gte: (new Date((new Date).getTime() - (1000*60*60))).toISOString()},
  }
  // var allPurveyors = Purveyors.find({teamId: {$in: teamIds}});
  // console.log('userId: ', userId, ' teamIds: ', teamIds, ' count:', allPurveyors.count())
  // return allPurveyors;
  return Purveyors.find(query);
});

Meteor.publish('categories', function(userId, teamIds) {
  var query = {
    teamId: {$in: teamIds},
    updatedAt: {$gte: (new Date((new Date).getTime() - (1000*60*60))).toISOString()},
    // updatedAt: {$gte: '2016-03-29T00:00:00.000Z'},
  }
  return Categories.find(query);
});

Meteor.publish('products', function(userId, teamIds, onlyNew) {
  var query = {
    teamId: {$in: teamIds},
  }
  if(onlyNew) {
    query.updatedAt = {$gte: (new Date((new Date).getTime() - (1000*60*60))).toISOString()}
  }
  return Products.find(query);
});

Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});

Meteor.publish('orders', function(userId, teamIds, onlyNew) {
  var query = {
    teamId: {$in: teamIds},
  }
  var queryOptions = {
    sort:{orderedAt: -1}
  }

  if(onlyNew){
    query.orderedAt = {$gte: (new Date()).toISOString()}
  }

  return Orders.find(query,queryOptions);
});

Meteor.publish('cart-items', function(userId, teamIds, deprecate, onlyNew) {
  var cartItemQuery = {
    teamId: { $in: teamIds},
  };

  if(onlyNew){
    cartItemQuery.updatedAt = { $gte: (new Date()).toISOString() }
  }

  return CartItems.find(cartItemQuery, {sort:{createdAt: -1}});
});

Meteor.publish('restricted', function(userId) {
  var query = {_id: userId}
  var user = Meteor.users.findOne(query);
  if(!user){
    var userPkg = Meteor.call('getUserByPhoneNumber', userId);
    query = {_id: userPkg.userId}
  }

  var queryOptions = {
    fields: {
      smsToken: 0,
      password: 0,
      services: 0
    }
  };

  var users = Meteor.users.find(query,queryOptions);
  return users;
});

Meteor.publish('settings', function(userId) {
  updateUserSettings(userId)
  return Settings.find({userId: userId});
});
