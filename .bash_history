users
passwd
exit
clear
sudo apt update
sudo apt install nodejs npm
node --version
sudo apt-get install gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc |    sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg    --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl status mongod
sudo systemctl enable mongod
sudo apt update
sudo apt install apache2
sudo ufw app list
sudo ufw allow 'Apache Secure'
sudo ufw status
sudo ufw enable
sudo ufw status
sudo ufw allow 27017/tcp
sudo ufw status
sudo npm init -y
sudo npm install express --save
sudo systemctl enable snapd
sudo systemctl start snapd
sudo systemctl status snapd
sudo snap install --classic certbot
curl http://sportstracker.icu
dig +short sportstracker.icu
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --apache
curl ifconfig.me
hostname
hostname -I
sudo certbot --apache
hostname -I
sudo ufw status
sudo ufw block 'Apache Secure'
sudo ufw deny 'Apache Secure'
sudo ufw allow 'Apache Full'
sudo certbot --apache
sudo certbot renew --dry-run
curl -4 icanhazip.com
sudo systemctl restart apache2
sudo nano /etc/apache2/sites-available/000-default-le-ssl.conf
sudo a2enmod ssl
sudo systemctl restart apache2
sudo nano /etc/apache2/sites-available/000-default-le-ssl.conf
sudo systemctl restart apache2
sudo systemctl status apache2
sudo netstat -tuln | grep 443
dig +short sportstracker.icu
sudo ufw reload
dig sportstracker.icu
sudo a2enmod ssl
sudo systemctl restart apache2
sudo nano /etc/apache2/sites-available/000-default-le-ssl.conf
sudo systemctl restart apache2
sudo tail -f /var/log/apache2/error.log
curl -I https://sportstracker.icu
sudo apache2ctl configtest
sudo nano /etc/apache2/apache2.conf
sudo systemctl restart apache2
sudo apache2ctl configtest
sudo ufw status
sudo ufw allow 'Apache Secure'
sudo ufw status
sudo ufw delete allow 'Apache Full'
sudo ufw status
sudo ufw allow ssh
sudo ufw status
nano /var/www/html/index.html 
rm /var/www/html/index.html 
touch /var/www/html/index.html
nano /var/www/html/index.html 
exit
clear
exit
clear
ls
systemctl mongod
systemctl status mongod
nano /etc/mongod.conf 
systemctl restart mongod
clear
sudo netstat -tuln
exit
clear
npm install express mongoose passport passport-google-oauth20 dotenv jsonwebtoken cors
ls
ufw deny 27017
ufw status
sudo ufw delete 27017
sudo ufw delete allow 27017
sudo ufw delete 27017/tcp
sudo ufw delete 27017
sudo ufw status numbered
sudo ufw delete 6
sudo ufw status numbered
sudo ufw delete 2
sudo ufw status numbered
sudo ufw delete 
sudo ufw status numbered
sudo ufw delete 5
sudo ufw status numbered
sudo ufw delete 2
sudo ufw status numbered
sudo ufw delete 3
sudo ufw status numbered
sudo ufw allow ssh
sudo ufw status numbered
users
nano /etc/mongod.conf 
USERS
users
passwd
npm install express mongoose dotenv bcrypt cors
mkdir models
random
top 10 /dev/urandom 
less /dev/urandom 
less -f /dev/urandom 
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node server.js 
sudo a2enmod proxy proxy_http rewrite ssl headers
sudo systemctl restart apache2
cd /etc/apache2/sites-available/
sudo nano sportstracker.icu.conf
ls
more 000-default.conf 
ls
less default-ssl.conf 
sudo nano sportstracker.icu.conf
less default-ssl.conf 
less ../sites-enabled/000-default
less ../sites-enabled/000-default.conf 
sudo nano sportstracker.icu.conf
sudo a2ensite sportstracker.icu.conf 
systemctl reload apache2.service 
sudo apache2ctl configtest
sudo a2dissite 000-default
systemctl reload apache2
cd ~
ls
npm server.js 
npm start server.js 
ls /etc/apache2/sites-enabled/
sudo a2dissite 000-default-le-ssl.conf 
systemctl reload apache2
npm start server.js 
npm install jsonwebtoken express-validator
npm start server.js 
sudo tail -n 20 /var/log/apache2/sportstracker.icu-ssl-access.log
npm start server.js 
less /etc/apache2/sites-enabled/sportstracker.icu.conf 
npm start server.js 
more /etc/apache2/sites-available/000-default-le-ssl.conf 
nano /etc/apache2/sites-enabled/sportstracker.icu.conf
systemctl restart apache2.service 
nano /etc/apache2/sites-enabled/sportstracker.icu.conf
more /etc/apache2/sites-enabled/sportstracker.icu.conf 
sudo certbot certificates
npm start server.js 
users
exit
users
reboot
ufw status
npm start server.js 
sudo timedatectl set-timezone Europe/Vilnius
npm start server.js 
sudo timedatectl set-timezone Europe/Vilnius
reboot
npm start server.js 
exit
npm start server.js 
exit
npm start server.js 
sudo tail -n 30 /var/log/apache2/error.log
npm start server.js 
exit
users
npm start server.js 
npm install google-auth-library
npm start server.js 
exit
npm start server.js 
exit
npm start server.js 
npm install date-fns
npm start server.js 
exit
npm start server.js 
npm i axios
npm start server.js 
sudo npm install -g pm2
pm2 start server.js --name "sportstracker-api"
pm2 save]
pm2 save
pm2 startup
pm2 status
pm2 logs 
pm2 status
pm2
pm2 status
pm2 stop
pm2 stop 0
npm server.js
npm start server.js 
npm server.js
npm start server.js 
logout
pm2 status
npm start server.js 
restart
reboot
npm start server.js 
logout
npm start server.js 
npm install nodemailer
sudo apt get update
sudo apt update
npm install dotenv
npm start server.js 
sudo ufw allow out 465/tcp
npm start server.js 
sudo ufw allow out 587/tcp
npm start server.js 
logout
npm start server.js 
logout
npm start server.js 
npm ls --depth=0
node --version
apache --version
apache2 --version
logout
pm2 --version
mongo --version
mongodb --version
mongod --version
apached --version
apache2 -v
logout
npm start server.js 
clear
pm2 status
pm2 start 0
pm2 stop 0
pm2 start 0
pm2 stop 0
clear
pm2 status
pm2 start 0
pm2 status
pm2 restart
pm2 restart 0
pm2 stop 0
logout
ls
reboot
users
ls
pm2 status
pm2 start 0
pm2 restart 0
pm2 stop 0kkkweedfgdf
pm2 start 0
pm2 restart 0
npm start server.js 
