#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
* @python name:		open-falcon/geodb.py
* @description:		This file gets geocode data.
* @related issues:	OWL-159
* @author:			Don Hsieh
* @since:			11/19/2015
* @last modified:	11/19/2015
* @called by:
"""
# sudo apt-get update; sudo apt-get install -y python-xlrd python-mysqldb python-pip; sudo pip install requests xlwt beautifulsoup4
from __future__ import division
from contextlib import closing
from datetime import datetime
from datetime import timedelta
from dateutil.relativedelta import *
import json
import MySQLdb
import os
import re
import requests
import shutil
import sys
import time
import urllib

"""
* @def name:		getNow(format=None)
* @description:		This function returns a string of time of now.
* @related issues:	OWL-052
* @param:			string format=None
* @return:			string now
* @author:			Don Hsieh
* @since:			06/17/2014
* @last modified:	06/17/2014
* @called by:		def download(images)
*					 in open-falcon/geodb.py
"""
def getNow(format=None):
	if format is None: format = '%Y-%m-%d %H:%M:%S'
	now = datetime.now().strftime(format)
	return now

"""
* @def name:        insertDB(table, fields, args)
* @description:     This function inserts data into database.
* @related issues:  OWL-159
* @param:           string table
* @param:           string fields
* @param:           tuple args
* @return:          void
* @author:          Don Hsieh
* @since:           11/19/2015
* @last modified:   11/19/2015
* @called by:       def buildProvinceTable()
"""
def insertDB(table, fields, args):
	if args is None: return False
	if len(args) < 1: return False
	fieldsCount = len(fields.split(', '))
	arr = []
	for i in range(fieldsCount):
		arr.append('%s')
	values = ', '.join(arr)
	values = '(' + values + ')'
	sql = 'INSERT INTO `' + table + '`(' + fields + ') VALUES ' + values
	rows = doSQL(table, sql, args)

"""
* @def name:        doSQL(table, sql, args)
* @description:     This function executes SQL command and returns result.
* @related issues:  OWL-159
* @param:           string table
* @param:           string sql
* @param:           [tuple, list, or None] args
* @return:          list rows
* @author:          Don Hsieh
* @since:           11/19/2015
* @last modified:   11/19/2015
* @called by:       def insertDB(dbName, table, fields, args)
"""
def doSQL(table, sql, args):
	path = os.path.dirname(os.path.realpath(__file__))
	jsonFile = os.path.join(path, os.pardir, 'cfg.json')
	print(jsonFile)
	with open(jsonFile) as data_file:
		data = json.load(data_file)
		url = data['db']['addr']
		account = data['db']['addr'].split('@')[0]
		user = account.split(':')[0]
		password = account.split(':')[-1]
		server = data['db']['addr'].split('@')[-1]
		ip = server.split('/')[0].split(':')[0].replace('tcp(', '')
		db = server.split('/')[-1].split('?')[0]

		multipleRowsOfArgs = False
		if args is not None:
			if args[0] is not None and isinstance(args[0], (list, tuple)):
				multipleRowsOfArgs = True
			for i in range(len(args)):
				if isinstance(args[i], list): args[i] = tuple(args[i])
			if isinstance(args, list): args = tuple(args)

		mydb = MySQLdb.connect(
			host=ip,
			user=user,
			passwd=password,
			charset='utf8',
			db=db
		)

		with closing(mydb.cursor()) as cursor:
			# cur.execute("somestuff")
			# results = cur.fetchall()

			# cur.execute("insert operation")
			# # call commit if you do INSERT, UPDATE or DELETE operations
			# db.commit()

			# cur.execute("someotherstuff")
			# results2 = cur.fetchone()
			if multipleRowsOfArgs: cursor.executemany(sql, args)
			else: cursor.execute(sql, args)
			rows = cursor.fetchall()
			mydb.commit()

		# at some point when you decided that you do not need
		# the open connection anymore you close it
		mydb.close()

"""
* @def name:        buildProvinceTable()
* @description:     This function build "province" table in database.
* @related issues:  OWL-159
* @param:           void
* @return:          void
* @author:          Don Hsieh
* @since:           11/19/2015
* @last modified:   11/19/2015
* @called by:       main
"""
def buildProvinceTable():
	path = os.path.dirname(os.path.realpath(__file__))
	jsonFile = os.path.join(path, 'data', 'province.json')
	print(jsonFile)
	with open(jsonFile) as data_file:
		data = json.load(data_file)
		for key in data:
			province = unicode(key['name'])
			count = key['value']
			longitude = key['coord'][0]
			latitude = key['coord'][1]

			table = 'province'
			fields = 'province, count, longitude, latitude, updated_at'
			args = (province, count, longitude, latitude, getNow())
			print(args)
			insertDB(table, fields, args)

"""
* @def name:        buildCityTable()
* @description:     This function build "city" table in database.
* @related issues:  OWL-159
* @param:           void
* @return:          void
* @author:          Don Hsieh
* @since:           11/19/2015
* @last modified:   11/19/2015
* @called by:       main
"""
def buildCityTable():
	path = os.path.dirname(os.path.realpath(__file__))
	jsonFile = os.path.join(path, 'data', 'latlng.json')
	print(jsonFile)
	with open(jsonFile) as data_file:
		data = json.load(data_file)
		results = []
		obj = {}
		for countryName in data:
			china = data[countryName]
			for provinceName in china:
				if provinceName != 'count':
					province = china[provinceName]
					for cityName in province:
						if len(cityName) > 1 and cityName != 'count' and cityName != 'lat' and cityName != 'lng':
							city = province[cityName]
							count = city['count']
							longitude = city['lng']
							latitude = city['lat']

							table = 'city'
							fields = 'city, province, count, longitude, latitude, updated_at'
							args = (cityName, provinceName, count, longitude, latitude, getNow())
							print(args)
							insertDB(table, fields, args)
			
buildProvinceTable()
buildCityTable()
print("Done")