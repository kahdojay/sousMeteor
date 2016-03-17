if(Meteor.isServer){
  Meteor.methods({

    getBuildInfo: function(){
      return {
        version: pkgInfo.version,
        build: pkgInfo.build,
      };
    },

    getSettingsConfig: function() {
      log.debug('RETURNING SETTINGS CONFIG: ', settingsConfig)
      return settingsConfig;
    },

    getAppStoreVersion: function() {
      try {
        var response = Meteor.http.get('https://itunes.apple.com/lookup?id=1048477858', {timeout: 10000});
        return response.data.results[0].version
      } catch(e){
        return null
      }
    },


    // ... end of function
  })
}
