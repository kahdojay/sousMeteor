if(Meteor.isServer){
  Meteor.methods({

    createPurveyor: function(purveyorAttributes) {
      log.debug("PURVEYOR ATTRS", purveyorAttributes);
      var purveyor = Purveyors.findOne({teamId: purveyorAttributes.teamId, name:purveyorAttributes.name});
      if(purveyor === undefined){
        purveyorAttributes.updatedAt = (new Date()).toISOString();
        var purveyorId = Purveyors.insert(purveyorAttributes);
        var purveyor = Purveyors.findOne({_id: purveyorId});
        log.debug("CREATED PURVEYOR", purveyor);
      } else {
        log.error("Purveyor already exists");
        // TODO: publish an error
      }
    },

    deletePurveyor: function(purveyorId, userId) {
      log.debug("DELETE PURVEYOR ", purveyorId);
      Purveyors.update(purveyorId, {
        $set: {
          deleted: true,
          updatedAt: (new Date()).toISOString(),
          deletedAt: (new Date()).toISOString(),
          deletedBy: userId,
        }
      });
    },

    renamePurveyor: function(purveyorCode, newPurveyorName) {
      let purveyor = Purveyors.findOne({purveyorCode: purveyorCode})
      Purveyors.update(
        {_id: purveyor._id},
        { $set: {
          name: newPurveyorName,
          company: newPurveyorName,
          updatedAt: (new Date()).toISOString(),
        }}
      )
    },

  })
}
