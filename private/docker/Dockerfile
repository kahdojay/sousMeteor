#### Use nodejs v6.3.1
#
FROM nodesource/xenial:6.3.1

#### Update apt-get and install supervisor
#
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update
RUN apt-get install -y supervisor yarn

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

#### Run npm install and npm rebuild
#
RUN yarn install --force

#### Fix the npm-bcrypt issue..
# set the working directory to: /usr/src/app/bundle/programs/server/npm/node_modules/meteor/npm-bcrypt
#
WORKDIR /usr/src/app/bundle/programs/server/npm/node_modules/meteor/npm-bcrypt
RUN rm -rf node_modules/bcrypt
RUN yarn add bcrypt

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
