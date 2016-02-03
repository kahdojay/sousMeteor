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
  return Teams.find({
    users: {$in: [userId]},
    notepad: {$exists: false},
  });
});

Meteor.publish('purveyors', function(userId, teamIds) {
  return Purveyors.find({teamId: {$in: teamIds}});
});

Meteor.publish('categories', function(userId, teamIds) {
  return Categories.find({teamId: {$in: teamIds}});
});

Meteor.publish('products', function(userId, teamIds) {
  return Products.find({
    teamId: {$in: teamIds}
  });
});

Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});

Meteor.publish('orders', function(userId, teamIds) {
  return Orders.find({
    teamId: {$in: teamIds},
    orderedAt: {$gte: (new Date()).toISOString()},
  },{
    sort:{orderedAt: -1}
  });
});

Meteor.publish('cart-items', function(userId, teamIds, sinceCreatedAt) {
  if(sinceCreatedAt === undefined){
    sinceCreatedAt = (new Date()).toISOString();
  }
  var cartItemQuery = {
    teamId: { $in: teamIds},
    updatedAt: { $gte: (new Date()).toISOString() },
  };
  return CartItems.find(cartItemQuery, {sort:{createdAt: -1}});
});

Meteor.publish('restricted', function(phoneNumber) {
  // Meteor.users.update({username: phoneNumber}, {$set: {
  //   smsToken: null,
  //   smsSent: false,
  //   smsVerified: false,
  // }});
  var users = Meteor.users.find({username: phoneNumber},{
    fields: {
      smsToken: 0,
      password: 0,
      services: 0
    }
  });
  return users;
});

Meteor.publish('settings', function(userId) {
  updateUserSettings(userId)
  return Settings.find({userId: userId});
});
