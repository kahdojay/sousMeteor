function getTeamUsers(teamIds) {
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

Meteor.publish('messages', function(teamIds) {
  var teamUserIds = getTeamUsers(teamIds);
  var filteredUserIds = Meteor.users.find({
    _id: {$in: Object.keys(teamUserIds)},
    superUser: false
  }, {
    fields: {
      _id: 1,
    }
  }).fetch();
  // console.log('TEAM IDS', teamIds)
  //TODO limit 20 for each teamId in teamIds
  var userIds = filteredUserIds.map(function(user){
    return user._id;
  })
  return Messages.find({userId: {$in: userIds}}, {sort: {createdAt: -1}, limit:20});
}.bind(this));
Meteor.publish('teams', function(userId) {
  return Teams.find({users: {$in: [userId]}});
});
Meteor.publish('teams-users', function(teamIds){
  var teamUserIds = getTeamUsers(teamIds);
  return Meteor.users.find({
    _id: {$in: Object.keys(teamUserIds)},
    superUser: false
  }, {
    fields: {
      firstName: 1,
      lastName: 1,
      username: 1
    }
  });
}.bind(this));
Meteor.publish('purveyors', function(teamId) {
  return Purveyors.find();
  // TODO: limit by teamId
  // return Purveyors.find({teamId: teamId});
});
Meteor.publish('categories', function(teamId) {
  return Categories.find();
  // TODO: limit by teamId
  // return Categories.find({teamId: teamId});
});
Meteor.publish('products', function(purveyorList) {
  return Products.find();
  // TODO: limit by teamId
  // return Products.find({purveyors: {$in: purveyorList}});
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
