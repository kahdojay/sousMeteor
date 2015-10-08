Meteor.publish('messages', function(teamKey) {
  return Messages.find({teamKey: teamKey});
});
