#### Use nodejs v4.1.1
#
FROM nodesource/jessie:4.1.1

#### Update apt-get and install supervisor
#
RUN apt-get update
RUN apt-get install -y supervisor

############################################################
##### ADD ANY OTHER DEPENDENCIES (eg. MongoDB, etc)
############################################################

#### Set the NPM_CONFIG_LOGLEVEL to warn
#
ENV NPM_CONFIG_LOGLEVEL warn

#### Add label
#
LABEL name="sousMeteor"

#### Copy the meteor output and extract the archive(s)
#
COPY . .
RUN cat *meteor-part* > bundle.tar.gz
RUN rm *meteor-part*
RUN tar -xzf bundle.tar.gz

#### Set the working directory to /usr/src/app/bundle/programs/server
#
WORKDIR /usr/src/app/bundle/programs/server
RUN npm install -g npm@next

#### Run npm install and npm rebuild
#
RUN npm install
RUN npm rebuild

#### Fix the npm-bcrypt issue..
# set the working directory to: /usr/src/app/bundle/programs/server/npm/node_modules/meteor/npm-bcrypt
#
WORKDIR /usr/src/app/bundle/programs/server/npm/node_modules/meteor/npm-bcrypt
RUN rm -rf node_modules/bcrypt
RUN npm install bcrypt

#### Set the working directory to /usr/src/app/bundle
#
WORKDIR /usr/src/app/bundle

#### Copy the supervisord config to the correct location
#
RUN cp /usr/src/app/supervisor-app.conf /etc/supervisor/conf.d/

#### Expose port 3000
EXPOSE 3000 3000

#### Execute the supervisor daemon command
# -n Run supervisord in the foreground.
# -e The logging level at which supervisor should write to the activity log. Valid levels are trace, debug, info, warn, error, and critical.
#
CMD ["supervisord", "-n", "-e", "warn"]
