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
    _id: {$in: Object.keys(teamsUsersIds)}
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

Meteor.publish('messages', function(userId, teamIds) {
  var teamsUsersIds = getTeamsUsersIds(teamIds);
  var userIds = filterUserIds(userId, teamsUsersIds);
  return Messages.find({userId: {$in: userIds}}, {sort: {createdAt: -1}, limit:20});
}.bind(this));

Meteor.publish('teams-users', function(userId, teamIds){
  var teamsUsersIds = getTeamsUsersIds(teamIds);
  var userIds = filterUserIds(userId, teamsUsersIds);
  return Meteor.users.find({_id: {$in: userIds}}, {
    fields: {
      firstName: 1,
      lastName: 1,
      username: 1,
      superUser: 1,
    }
  });
}.bind(this));

Meteor.publish('teams', function(userId) {
  return Teams.find({users: {$in: [userId]}});
});

<<<<<<< 079de3d374bd337ad4cad4c6fd7e3ed4d1a5a62d
Meteor.publish('purveyors', function(teamIds) {
  return Purveyors.find({teamId: teamIds});
});

Meteor.publish('categories', function(teamIds) {
  return Categories.find({teamId: {$in: teamIds}});
});

Meteor.publish('products', function(teamIds) {
Meteor.publish('purveyors', function(userId, teamIds) {
  return Purveyors.find({teamId: teamIds});
});
Meteor.publish('categories', function(userId, teamIds) {
  return Categories.find({teamId: {$in: teamIds}});
});

Meteor.publish('products', function(userId, teamIds) {
>>>>>>> Add userId to the categories, products and purveyors subscriptions
  return Products.find({teamId: {$in: teamIds}});
});

Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});

Meteor.publish('restricted', function(phoneNumber) {
  var users = Meteor.users.find({username: phoneNumber},{
    fields: {
      smsToken: 0,
      password: 0,
      services: 0
    }
  });
  return users;
});
