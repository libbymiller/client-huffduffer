## Install wheezy on a card

    diskutil list
    diskutil unmountDisk /dev/diskn
    sudo dd bs=1m if=~/Downloads/2015-05-05-raspbian-wheezy.img of=/dev/rdiskn

## sudo raspi-config

expend file system
reboot

## Provison a radiodan

    git clone https://github.com/radiodan/provision
    cd provision
    git checkout -b broker remotes/origin/broker
    sudo LOG_LEVEL=DEBUG ./provision all

## If anything fails...

look at https://github.com/radiodan/provision/issues/3 and thereabouts - once nginx is installed the other problems will go away.


## If on a pi2, reinstall all the node modules in /opt/radiodan/apps/ subdirectories

    cd /opt/radiodan/apps/buttons/current
    rm -r node_modules
    npm install

and similarly for...

    /opt/radiodan/apps/buttons/current
    /opt/radiodan/apps/magic/current
    /opt/radiodan/apps/server/current

## Check out the piab software

Radiodan keeps its apps in /opt/radiodan/apps, so we’ll put it there. 

    cd /opt/radiodan/apps 
    sudo git clone https://github.com/libbymiller/radiodan-client-podcast.git 
    cd radiodan-client-podcast/ 
    sudo chown -R pi:pi .

Install the dependences for node

    npm install 

and for the python nxppy code (for interacting with the NFC reader)

    cd 
    sudo apt-get update 
    sudo apt-get -y install build-essential python2.7-dev python-setuptools cmake 
    curl -O https://bootstrap.pypa.io/get-pip.py 
    sudo python get-pip.py 
    sudo pip install requests

Install nxppy: 

    git clone https://github.com/svvitale/nxppy.git 
    cd nxppy 
    sudo python setup.py build install


Make a small edit to the buttons interface: 

    $ sudo pico /opt/radiodan/apps/buttons/current/lib/bootstrap.js 

    // Reverse the polarity of the neutron flow 
    // rgbOpts.reverse = true; 
    ^^^ comment out this line, like this

switch device type

    sudo cp radiodan-type-offline-piab.conf /etc/supervisor/available/
    sudo radiodan-device-type radiodan-type-offline-piab.conf

reboot

test

    curl -X POST http://localhost:5000/rssFromNFC -d "feedUrl=http://www.bbc.co.uk/programmes/b00lvdrj/episodes/downloads.rss"

You should hear the podcast. Stop it like this:

    curl -X POST http://localhost:5000/stopFromNFC

Attach the NFC reader

http://www.ebay.co.uk/itm/251995292455
http://www.instructables.com/id/Attendance-system-using-Raspberry-Pi-and-NFC-Tag-r/step3/The-software/

enable spi

then

    sudo apt-get install python-dev
    cd
    git clone https://github.com/lthiery/SPI-Py

and install it via

    sudo python setup.py install
    cd
    git clone https://github.com/mxgxw/MFRC522-python.git
    cd MFRC522-python

test:

    python Read.py

...@@

add a crontab (as root?):

    5 * * * * cd /opt/radiodan/apps/radiodan-client-podcast; /usr/local/bin/node cacher.js
