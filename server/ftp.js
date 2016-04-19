if(Meteor.isServer){
  Meteor.methods({
    uploadOrderToFtp: function(orderPkg) {
      log.debug('UPLOADING ORDER TO FTP - orderId: ', orderPkg.orderId, ', orderRef: ', orderPkg.orderRef, ' teamPurveyorSettings: ', orderPkg.teamPurveyorSettings)

      if(
        orderPkg.orderId
        && orderPkg.orderRef
        && orderPkg.orderDate
        && orderPkg.teamPurveyorSettings
        && orderPkg.orderProductList
      ){
        var Client = Npm.require('ftp');
        var ftpClient = new Client();

        if(orderPkg.teamPurveyorSettings.hasOwnProperty('ftp') === false){
          log.error('UPLOAD ORDER TO FTP ERROR: Missing team purveyor settings for ftp.')
          return;
        }

        var ftpSettings = orderPkg.teamPurveyorSettings.ftp;
        var clientSettings = orderPkg.teamPurveyorSettings.client;

        var templateHelpers = {
          lpad: function(text, num, padder) {
            return s.lpad(text, num, padder);
          },
          rpad: function(text, num, padder) {
            return s.rpad(text, num, padder);
          },
        }

        SSR.compileTemplate('templateHeader', Assets.getText(`templates/${ftpSettings.templateHeader}.html`));
        Template.templateHeader.helpers(templateHelpers);

        SSR.compileTemplate('templateBody', Assets.getText(`templates/${ftpSettings.templateBody}.html`));
        Template.templateBody.helpers(templateHelpers);

        SSR.compileTemplate('templateFilename', Assets.getText(`templates/${ftpSettings.templateFilename}.html`));
        Template.templateFilename.helpers(templateHelpers);


        var orderFileName = SSR.render('templateFilename',  {filename: Math.floor(Math.random()*100000)});
        orderFileName = orderFileName.replace('\n','');

        var orderData = [];

        var orderNumber = orderPkg.orderRef;
        var customerNumber = clientSettings.customerNumber;
        var shipDate = orderPkg.orderDate.format('MMDDYYYY');
        // var customerPO = clientSettings.customerPO;
        var customerPO = 'SOUS' + orderPkg.orderRef;
        var memoCode = '';
        var shippingInstructions = '';
        var deliveryInstructions = '';


        var recordHeader = SSR.render('templateHeader', {
          orderNumber: orderNumber,
          customerNumber: customerNumber,
          customerPO: customerPO,
          shipDate: shipDate,
          memoCode: memoCode,
          shippingInstructions: shippingInstructions,
          deliveryInstructions: deliveryInstructions,
        });
        recordHeader = recordHeader.replace('\n', '');
        orderData.push(recordHeader);

        orderPkg.orderProductList.forEach(function(product) {
          product.orderNumber = orderNumber;
          product.price = product.price.replace(/[^0-9]/g,'');
          var recordRow = SSR.render("templateBody", product);
          recordRow = recordRow.replace('\n', '');
          orderData.push(recordRow);
        })

        orderData = orderData.join('\n');
        // console.log('---------------------');
        // console.log(orderData);
        // console.log('---------------------');
        // console.log(`File name: '${orderFileName}'`)
        // return;

        var stringStream = new stream.Readable();
        stringStream._read = function noop() {};
        stringStream.push(orderData);
        stringStream.push(null);

        try {
          ftpClient.on('ready', function() {
            ftpClient.put(stringStream, `${orderFileName}`, function(err) {
              if (err) {
                log.error('UPLOAD ORDER TO FTP ERROR: ', err)
              } else {
                log.debug(`UPLOAD ORDER TO FTP: Successfully uploaded file: ${orderFileName}`)
              }
              ftpClient.end();
            })
          })
          ftpClient.connect({
            "host": ftpSettings.host,
            "port": parseInt(ftpSettings.port),
            "user": ftpSettings.user,
            "password": ftpSettings.pass,
          })
        } catch(err){
          log.error('FTP UPLOAD ERROR: ', err)
        }

      } else {
        log.error('UPLOAD ORDER TO FTP ERROR: Missing data.')
      }
    }
  })

}
