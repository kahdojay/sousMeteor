if(Meteor.isServer){
  Meteor.methods({

    createPurveyor: function(purveyorAttributes, userId) {
      log.debug("PURVEYOR ATTRS", purveyorAttributes);
      var purveyor = Purveyors.findOne({teamId: purveyorAttributes.teamId, name:purveyorAttributes.name});
      if(purveyor === undefined){
        purveyorAttributes.updatedAt = (new Date()).toISOString();
        var purveyorId = Purveyors.insert(purveyorAttributes);
        var purveyor = Purveyors.findOne({_id: purveyorId});
        log.debug("CREATED PURVEYOR", purveyor);
      } else {
        log.error("Purveyor already exists");
        Meteor.call('triggerError',
          'verification-error',
          'Error: a purveyor with the same name already exists.',
          userId, null, purveyorAttributes
        )
      }
    },

    updatePurveyor: function(purveyorId, purveyorAttributes) {
      var realPurveyorId = {_id: purveyorId};
      purveyorAttributes.updatedAt = (new Date()).toISOString();
      var updatedPurveyor = Purveyors.findOne(realPurveyorId);
      Object.keys(purveyorAttributes).forEach(function(key){
        if(APPROVED_PURVEYOR_ATTRS.hasOwnProperty(key) && APPROVED_PURVEYOR_ATTRS[key] === true){
          updatedPurveyor[key] = purveyorAttributes[key];
        }
      })
      if(updatedPurveyor.hasOwnProperty('deleted') === true && updatedPurveyor.deleted === true){
        updatedPurveyor.deletedAt = (new Date()).toISOString()
      }
      log.debug("UPDATE PURVEYOR ATTRS ", updatedPurveyor);
      return Purveyors.update(realPurveyorId, {$set: updatedPurveyor});
    },

    deletePurveyor: function(purveyorId, purveyorAttributes) {
      log.debug("DELETE PURVEYOR ", purveyorId, purveyorAttributes);
      return Purveyors.update(purveyorId, {
        $set: {
          deleted: purveyorAttributes.deleted || true,
          deletedBy: purveyorAttributes.userId || null,
          deletedAt: purveyorAttributes.deletedAt || (new Date()).toISOString(),
          updatedAt: (new Date()).toISOString(),
        }
      });
    },

    renamePurveyor: function(purveyorCode, newPurveyorName) {
      let purveyor = Purveyors.findOne({purveyorCode: purveyorCode})
      return Purveyors.update(
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
