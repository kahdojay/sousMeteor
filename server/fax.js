Meteor.methods({
  faxOrder: function(options) {
    log.debug('sending Phaxio to: ', options.number)
    var Phaxio = Npm.require('phaxio');
    var phaxio = new Phaxio(Meteor.settings.PHAXIO.KEY, Meteor.settings.PHAXIO.SECRET)
    var cb = function(err, data) {
      if (err) {
        log.debug('PHAXIO ERROR: ', err)
      } else {
        log.debug('PHAXIO DATA: ', data)
      }
    }
    phaxio.sendFax({
      to: options.number,
      string_data: options.text,
      string_data_type: 'text',
    }, cb)
  }
})
