if(Meteor.isServer){
  Meteor.methods({
    uploadOrderToFtp: function(orderPkg) {
      log.debug('UPLOAD ORDER TO FTP: ', orderPkg)
      if(orderPkg.orderId){
        var Client = Npm.require('ftp');
        var ftpClient = new Client();

        var orderData = [];
        var record = [];
        var recordType = 'H';
        var orderNumber = 'ABC123';
        var customerNumber = '300306';
        var shipDate = moment().format('MMDDYYYY');
        var customerPO = 'NBS1042247';
        var memoCode = '';
        var shippingInstructions = '';
        var deliveryInstructions = '';


        record.push(recordType);
        record.push(s.lpad(orderNumber, 6, '0'));
        record.push(s.lpad(customerNumber, 8, ' '));
        record.push(shipDate);
        record.push(s.rpad(customerPO, 10, ' '));
        record.push(s.rpad(memoCode, 3, ' '));
        record.push(s.rpad(shippingInstructions, 30, ' '));
        record.push(s.rpad(deliveryInstructions, 30, ' '));
        record.push(s.rpad('', 7, ' '));
        orderData.push(record.join(''));

        recordType = 'D';

        for(var i = 0; i < 10; i++){
          var record = [];
          var itemNumber = Math.floor(Math.random()*100000);
          var qtyOrdered = Math.floor(Math.random()*10);
          var price = Math.floor(Math.random()*10000);
          var splitIndicator = '';
          if(i % 4 === 3){
            splitIndicator = 'E';
          }

          record.push(recordType);
          record.push(s.lpad(orderNumber, 6, '0'));
          record.push(s.lpad(itemNumber, 8, ' '));
          record.push(s.lpad(qtyOrdered, 4, '0'));
          record.push(s.lpad(price, 7, '0'));
          record.push(s.rpad(splitIndicator, 1, ' '));
          record.push(s.rpad('', 76, ' '));

          orderData.push(record.join(''));
        }
        orderData = orderData.join('\n');

        var stringStream = new stream.Readable();
        stringStream._read = function noop() {};
        stringStream.push(orderData);
        stringStream.push(null);
        var orderFileName = `W${s.lpad(Math.floor(Math.random()*10000), 5, '0')}`;

        ftpClient.on('ready', function() {
          ftpClient.put(stringStream, `${orderFileName}`, function(err) {
            if (err) {
              log.debug('UPLOAD ORDER TO FTP ERROR: ', err)
            }
            ftpClient.end();
            log.debug(`UPLOAD ORDER TO FTP: Successfully uploaded file: ${orderFileName}`)
          })
        })
        ftpClient.connect({
          "host": '10.10.0.100',
          "user": 'sous',
          "password": 'sous'
        })

      } else {
        log.error('UPLOAD ORDER TO FTP ERROR: Missing data.')
      }
    }
  })

}
