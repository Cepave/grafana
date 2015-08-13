define([
  'angular',
  'jquery',
  'kbn',
  'moment',
  'lodash',
  'zrender',
  'echarts',
  'echarts/bar',
  // 'echarts.bar',
  // 'echarts.map',
  './graph.tooltip',
  'jquery.flot',
  'jquery.flot.events',
  'jquery.flot.selection',
  'jquery.flot.time',
  'jquery.flot.stack',
  'jquery.flot.stackpercent',
  'jquery.flot.fillbelow',
  'jquery.flot.crosshair',
],
// function (angular, $, kbn, moment, _, GraphTooltip) {
// function (angular, $, kbn, moment, _, GraphTooltip, ec) {
function (angular, $, kbn, moment, _, zr, ec, map, GraphTooltip) {
  'use strict';
  console.log('ec =', ec);

  var module = angular.module('grafana.directives');

  module.directive('grafanaGraph', function($rootScope, timeSrv) {
    return {
      restrict: 'A',
      template: '<div> </div>',
      link: function(scope, elem) {
        var dashboard = scope.dashboard;
        var data, annotations;
        var sortedSeries;
        var graphHeight;
        var legendSideLastValue = null;
        scope.crosshairEmiter = false;

        scope.onAppEvent('setCrosshair', function(event, info) {
          // do not need to to this if event is from this panel
          if (info.scope === scope) {
            return;
          }

          if(dashboard.sharedCrosshair) {
            var plot = elem.data().plot;
            if (plot) {
              plot.setCrosshair({ x: info.pos.x, y: info.pos.y });
            }
          }
        });

        scope.onAppEvent('clearCrosshair', function() {
          var plot = elem.data().plot;
          if (plot) {
            plot.clearCrosshair();
          }
        });

        // Receive render events
        scope.$on('render',function(event, renderData) {
          data = renderData || data;
          if (!data) {
            scope.get_data();
            return;
          }
          annotations = data.annotations || annotations;
          render_panel();
        });

        function getLegendHeight(panelHeight) {
          if (!scope.panel.legend.show || scope.panel.legend.rightSide) {
            return 0;
          }
          if (scope.panel.legend.alignAsTable) {
            var total = 30 + (25 * data.length);
            return Math.min(total, Math.floor(panelHeight/2));
          } else {
            return 26;
          }
        }

        function setElementHeight() {
          try {
            graphHeight = scope.height || scope.panel.height || scope.row.height;
            if (_.isString(graphHeight)) {
              graphHeight = parseInt(graphHeight.replace('px', ''), 10);
            }

            graphHeight -= 5; // padding
            graphHeight -= scope.panel.title ? 24 : 9; // subtract panel title bar

            graphHeight = graphHeight - getLegendHeight(graphHeight); // subtract one line legend

            elem.css('height', graphHeight + 'px');

            return true;
          } catch(e) { // IE throws errors sometimes
            return false;
          }
        }

        function shouldAbortRender() {
          if (!data) {
            return true;
          }

          if ($rootScope.fullscreen && !scope.fullscreen) {
            return true;
          }

          if (!setElementHeight()) { return true; }

          if (_.isString(data)) {
            render_panel_as_graphite_png(data);
            return true;
          }

          if (elem.width() === 0) {
            return true;
          }
        }

        function drawHook(plot) {
          // Update legend values
          var yaxis = plot.getYAxes();
          for (var i = 0; i < data.length; i++) {
            var series = data[i];
            var axis = yaxis[series.yaxis - 1];
            var formater = kbn.valueFormats[scope.panel.y_formats[series.yaxis - 1]];

            // decimal override
            if (_.isNumber(scope.panel.decimals)) {
              series.updateLegendValues(formater, scope.panel.decimals, null);
            } else {
              // auto decimals
              // legend and tooltip gets one more decimal precision
              // than graph legend ticks
              var tickDecimals = (axis.tickDecimals || -1) + 1;
              series.updateLegendValues(formater, tickDecimals, axis.scaledDecimals + 2);
            }

            if(!scope.$$phase) { scope.$digest(); }
          }

          // add left axis labels
          if (scope.panel.leftYAxisLabel) {
            var yaxisLabel = $("<div class='axisLabel left-yaxis-label'></div>")
              .text(scope.panel.leftYAxisLabel)
              .appendTo(elem);

            yaxisLabel.css("margin-top", yaxisLabel.width() / 2);
          }

          // add right axis labels
          if (scope.panel.rightYAxisLabel) {
            var rightLabel = $("<div class='axisLabel right-yaxis-label'></div>")
              .text(scope.panel.rightYAxisLabel)
              .appendTo(elem);

            rightLabel.css("margin-top", rightLabel.width() / 2);
          }
        }

        function processOffsetHook(plot, gridMargin) {
          if (scope.panel.leftYAxisLabel) { gridMargin.left = 20; }
          if (scope.panel.rightYAxisLabel) { gridMargin.right = 20; }
        }

        // Function for rendering panel
        function render_panel() {
          if (shouldAbortRender()) {
            return;
          }

          var panel = scope.panel;
          var stack = panel.stack ? true : null;

          // Populate element
          var options = {
            hooks: {
              draw: [drawHook],
              processOffset: [processOffsetHook],
            },
            legend: { show: false },
            series: {
              stackpercent: panel.stack ? panel.percentage : false,
              stack: panel.percentage ? null : stack,
              lines:  {
                show: panel.lines,
                zero: false,
                fill: translateFillOption(panel.fill),
                lineWidth: panel.linewidth,
                steps: panel.steppedLine
              },
              bars:   {
                show: panel.bars,
                fill: 1,
                barWidth: 1,
                zero: false,
                lineWidth: 0
              },
              points: {
                show: panel.points,
                fill: 1,
                fillColor: false,
                radius: panel.points ? panel.pointradius : 2
                // little points when highlight points
              },
              map: {
                show: panel.map,
                fill: 1,
                fillColor: false
              },
              shadowSize: 1
            },
            yaxes: [],
            xaxis: {},
            grid: {
              minBorderMargin: 0,
              markings: [],
              backgroundColor: null,
              borderWidth: 0,
              hoverable: true,
              color: '#c8c8c8',
              margin: { left: 0, right: 0 },
            },
            selection: {
              mode: "x",
              color: '#666'
            },
            crosshair: {
              mode: panel.tooltip.shared || dashboard.sharedCrosshair ? "x" : null
            }
          };
          // console.log('function render_panel() options =', options);
          // console.log('function render_panel() options.series.map =', options.series.map);
          // console.log('function render_panel() echarts =', echarts);

          for (var i = 0; i < data.length; i++) {
            var series = data[i];
            series.applySeriesOverrides(panel.seriesOverrides);
            series.data = series.getFlotPairs(panel.nullPointMode, panel.y_formats);

            // if hidden remove points and disable stack
            if (scope.hiddenSeries[series.alias]) {
              series.data = [];
              series.stack = false;
            }
          }

          if (data.length && data[0].stats.timeStep) {
            options.series.bars.barWidth = data[0].stats.timeStep / 1.5;
          }

          addTimeAxis(options);
          addGridThresholds(options, panel);
          addAnnotations(options);
          configureAxisOptions(data, options);

          sortedSeries = _.sortBy(data, function(series) { return series.zindex; });

          function callPlot(incrementRenderCounter) {
            try {
              // console.log('function callPlot() incrementRenderCounter =', incrementRenderCounter);
              console.log('function callPlot() elem =', elem);
              // console.log('function callPlot() typeof(elem) =', typeof(elem));
              console.log('function callPlot() elem[0] =', elem[0]);
              // console.log('function callPlot() typeof(elem[0]) =', typeof(elem[0]));
              console.log('function callPlot() sortedSeries =', sortedSeries);
              console.log('function callPlot() options =', options);
              console.log('function callPlot() options.series.map =', options.series.map);
              console.log('function callPlot() ec =', ec);

              var className = elem.attr('class');
              console.log('function callPlot() className =', className);

              if (options.series.map.show) {
                console.log('Let\'s draw map!');
                // var myChart = ec.init(document.getElementById('main'));
                // var div = document.getElementsByClassName(className);
                // console.log('function callPlot() div =', div);
                // var myChart = ec.init(document.getElementById(className));
                // var myChart = ec.init(document.getElementsByClassName(className));
                // console.log('hi');
                // var myChart = ec.init(elem);
                // console.log('function callPlot() myChart =', myChart);

                // console.log('function callPlot() jquery.flot =', jquery.flot);
                // console.log('function callPlot() ec =', ec);
                // $("div.histogram-chart").replaceWith( "<h2>New heading</h2>" );
                // $("div.histogram-chart").replaceWith( '<div id="main" style="height:400px"><h2>Hello Hihi</h2></div>' );
                // elem.replaceWith('<div id="main" style="height:200px"><h2>Echarts test</h2></div>');
                console.log('function callPlot() elem =', elem);
                // console.log('function callPlot() echarts =', echarts);
                // function (ec) {
                  // 基于准备好的dom，初始化echarts图表
                  var myChart = ec.init(document.getElementById('main'));
                  // var myChart = ec.init(document.getElementsByClassName(className));
                  var option = {
                    tooltip: {
                        show: true
                    },
                    legend: {
                        data:['销量']
                    },
                    xAxis : [
                        {
                            type : 'category',
                            data : ["衬衫","羊毛衫","雪纺衫","裤子","高跟鞋","袜子"]
                        }
                    ],
                    yAxis : [
                        {
                            type : 'value'
                        }
                    ],
                    series : [
                        {
                            "name":"销量",
                            "type":"bar",
                            "data":[5, 20, 40, 10, 10, 20]
                        }
                    ]
                  };
                  // var option = {
                  //   title : {
                  //       text: '快網全國主要城市 CDN',
                  //       subtext: 'data from Fastweb',
                  //       sublink: 'http://fastweb.com.cn',
                  //       x:'center'
                  //   },
                  //   tooltip : {
                  //       trigger: 'item'
                  //   },
                  //   legend: {
                  //       orient: 'vertical',
                  //       x:'left',
                  //       data:['CDN']
                  //   },
                  //   dataRange: {
                  //       min : 0,
                  //       max : 500,
                  //       calculable : true,
                  //       color: ['maroon','purple','red','orange','yellow','lightgreen']
                  //   },
                  //   toolbox: {
                  //       show : true,
                  //       orient : 'vertical',
                  //       x: 'right',
                  //       y: 'center',
                  //       feature : {
                  //           mark : {show: true},
                  //           dataView : {show: true, readOnly: false},
                  //           restore : {show: true},
                  //           saveAsImage : {show: true}
                  //       }
                  //   },
                  //   series : [
                  //       {
                  //           name: 'packets',
                  //           type: 'map',
                  //           mapType: 'china',
                  //           hoverable: false,
                  //           roam:true,
                  //           data : [],
                  //           markPoint : {
                  //               symbolSize: 5,       // 标注大小，半宽（半径）参数，当图形为方向或菱形则总宽度为symbolSize * 2
                  //               itemStyle: {
                  //                   normal: {
                  //                       borderColor: '#87cefa',
                  //                       borderWidth: 1,            // 标注边线线宽，单位px，默认为1
                  //                       label: {
                  //                           show: false
                  //                       }
                  //                   },
                  //                   emphasis: {
                  //                       borderColor: '#1e90ff',
                  //                       borderWidth: 5,
                  //                       label: {
                  //                           show: false
                  //                       }
                  //                   }
                  //               },
                  //               data : [
                  //                   {name: "海门", value: 9},
                  //                   {name: "鄂尔多斯", value: 12},
                  //                   {name: "招远", value: 12},
                  //                   {name: "舟山", value: 12},
                  //                   {name: "齐齐哈尔", value: 14},
                  //                   {name: "盐城", value: 15},
                  //                   {name: "赤峰", value: 16},
                  //                   {name: "青岛", value: 18},
                  //                   {name: "乳山", value: 18},
                  //                   {name: "金昌", value: 19},
                  //                   {name: "泉州", value: 21},
                  //                   {name: "莱西", value: 21},
                  //                   {name: "日照", value: 21},
                  //                   {name: "胶南", value: 22},
                  //                   {name: "南通", value: 23},
                  //                   {name: "拉萨", value: 24},
                  //                   {name: "云浮", value: 24},
                  //                   {name: "梅州", value: 25},
                  //                   {name: "文登", value: 25},
                  //                   {name: "上海", value: 25},
                  //                   {name: "攀枝花", value: 25},
                  //                   {name: "威海", value: 25},
                  //                   {name: "承德", value: 25},
                  //                   {name: "厦门", value: 26},
                  //                   {name: "汕尾", value: 26},
                  //                   {name: "潮州", value: 26},
                  //                   {name: "丹东", value: 27},
                  //                   {name: "太仓", value: 27},
                  //                   {name: "曲靖", value: 27},
                  //                   {name: "烟台", value: 28},
                  //                   {name: "福州", value: 29},
                  //                   {name: "瓦房店", value: 30},
                  //                   {name: "即墨", value: 30},
                  //                   {name: "抚顺", value: 31},
                  //                   {name: "玉溪", value: 31},
                  //                   {name: "张家口", value: 31},
                  //                   {name: "阳泉", value: 31},
                  //                   {name: "莱州", value: 32},
                  //                   {name: "湖州", value: 32},
                  //                   {name: "汕头", value: 32},
                  //                   {name: "昆山", value: 33},
                  //                   {name: "宁波", value: 33},
                  //                   {name: "湛江", value: 33},
                  //                   {name: "揭阳", value: 34},
                  //                   {name: "荣成", value: 34},
                  //                   {name: "连云港", value: 35},
                  //                   {name: "葫芦岛", value: 35},
                  //                   {name: "常熟", value: 36},
                  //                   {name: "东莞", value: 36},
                  //                   {name: "河源", value: 36},
                  //                   {name: "淮安", value: 36},
                  //                   {name: "泰州", value: 36},
                  //                   {name: "南宁", value: 37},
                  //                   {name: "营口", value: 37},
                  //                   {name: "惠州", value: 37},
                  //                   {name: "江阴", value: 37},
                  //                   {name: "蓬莱", value: 37},
                  //                   {name: "韶关", value: 38},
                  //                   {name: "嘉峪关", value: 38},
                  //                   {name: "广州", value: 38},
                  //                   {name: "延安", value: 38},
                  //                   {name: "太原", value: 39},
                  //                   {name: "清远", value: 39},
                  //                   {name: "中山", value: 39},
                  //                   {name: "昆明", value: 39},
                  //                   {name: "寿光", value: 40},
                  //                   {name: "盘锦", value: 40},
                  //                   {name: "长治", value: 41},
                  //                   {name: "深圳", value: 41},
                  //                   {name: "珠海", value: 42},
                  //                   {name: "宿迁", value: 43},
                  //                   {name: "咸阳", value: 43},
                  //                   {name: "铜川", value: 44},
                  //                   {name: "平度", value: 44},
                  //                   {name: "佛山", value: 44},
                  //                   {name: "海口", value: 44},
                  //                   {name: "江门", value: 45},
                  //                   {name: "章丘", value: 45},
                  //                   {name: "肇庆", value: 46},
                  //                   {name: "大连", value: 47},
                  //                   {name: "临汾", value: 47},
                  //                   {name: "吴江", value: 47},
                  //                   {name: "石嘴山", value: 49},
                  //                   {name: "沈阳", value: 50},
                  //                   {name: "苏州", value: 50},
                  //                   {name: "茂名", value: 50},
                  //                   {name: "嘉兴", value: 51},
                  //                   {name: "长春", value: 51},
                  //                   {name: "胶州", value: 52},
                  //                   {name: "银川", value: 52},
                  //                   {name: "张家港", value: 52},
                  //                   {name: "三门峡", value: 53},
                  //                   {name: "锦州", value: 54},
                  //                   {name: "南昌", value: 54},
                  //                   {name: "柳州", value: 54},
                  //                   {name: "三亚", value: 54},
                  //                   {name: "自贡", value: 56},
                  //                   {name: "吉林", value: 56},
                  //                   {name: "阳江", value: 57},
                  //                   {name: "泸州", value: 57},
                  //                   {name: "西宁", value: 57},
                  //                   {name: "宜宾", value: 58},
                  //                   {name: "呼和浩特", value: 58},
                  //                   {name: "成都", value: 58},
                  //                   {name: "大同", value: 58},
                  //                   {name: "镇江", value: 59},
                  //                   {name: "桂林", value: 59},
                  //                   {name: "张家界", value: 59},
                  //                   {name: "宜兴", value: 59},
                  //                   {name: "北海", value: 60},
                  //                   {name: "西安", value: 61},
                  //                   {name: "金坛", value: 62},
                  //                   {name: "东营", value: 62},
                  //                   {name: "牡丹江", value: 63},
                  //                   {name: "遵义", value: 63},
                  //                   {name: "绍兴", value: 63},
                  //                   {name: "扬州", value: 64},
                  //                   {name: "常州", value: 64},
                  //                   {name: "潍坊", value: 65},
                  //                   {name: "重庆", value: 66},
                  //                   {name: "台州", value: 67},
                  //                   {name: "南京", value: 67},
                  //                   {name: "滨州", value: 70},
                  //                   {name: "贵阳", value: 71},
                  //                   {name: "无锡", value: 71},
                  //                   {name: "本溪", value: 71},
                  //                   {name: "克拉玛依", value: 72},
                  //                   {name: "渭南", value: 72},
                  //                   {name: "马鞍山", value: 72},
                  //                   {name: "宝鸡", value: 72},
                  //                   {name: "焦作", value: 75},
                  //                   {name: "句容", value: 75},
                  //                   {name: "北京", value: 79},
                  //                   {name: "徐州", value: 79},
                  //                   {name: "衡水", value: 80},
                  //                   {name: "包头", value: 80},
                  //                   {name: "绵阳", value: 80},
                  //                   {name: "乌鲁木齐", value: 84},
                  //                   {name: "枣庄", value: 84},
                  //                   {name: "杭州", value: 84},
                  //                   {name: "淄博", value: 85},
                  //                   {name: "鞍山", value: 86},
                  //                   {name: "溧阳", value: 86},
                  //                   {name: "库尔勒", value: 86},
                  //                   {name: "安阳", value: 90},
                  //                   {name: "开封", value: 90},
                  //                   {name: "济南", value: 92},
                  //                   {name: "德阳", value: 93},
                  //                   {name: "温州", value: 95},
                  //                   {name: "九江", value: 96},
                  //                   {name: "邯郸", value: 98},
                  //                   {name: "临安", value: 99},
                  //                   {name: "兰州", value: 99},
                  //                   {name: "沧州", value: 100},
                  //                   {name: "临沂", value: 103},
                  //                   {name: "南充", value: 104},
                  //                   {name: "天津", value: 105},
                  //                   {name: "富阳", value: 106},
                  //                   {name: "泰安", value: 112},
                  //                   {name: "诸暨", value: 112},
                  //                   {name: "郑州", value: 113},
                  //                   {name: "哈尔滨", value: 114},
                  //                   {name: "聊城", value: 116},
                  //                   {name: "芜湖", value: 117},
                  //                   {name: "唐山", value: 119},
                  //                   {name: "平顶山", value: 119},
                  //                   {name: "邢台", value: 119},
                  //                   {name: "德州", value: 120},
                  //                   {name: "济宁", value: 120},
                  //                   {name: "荆州", value: 127},
                  //                   {name: "宜昌", value: 130},
                  //                   {name: "义乌", value: 132},
                  //                   {name: "丽水", value: 133},
                  //                   {name: "洛阳", value: 134},
                  //                   {name: "秦皇岛", value: 136},
                  //                   {name: "株洲", value: 143},
                  //                   {name: "石家庄", value: 147},
                  //                   {name: "莱芜", value: 148},
                  //                   {name: "常德", value: 152},
                  //                   {name: "保定", value: 153},
                  //                   {name: "湘潭", value: 154},
                  //                   {name: "金华", value: 157},
                  //                   {name: "岳阳", value: 169},
                  //                   {name: "长沙", value: 175},
                  //                   {name: "衢州", value: 177},
                  //                   {name: "廊坊", value: 193},
                  //                   {name: "菏泽", value: 194},
                  //                   {name: "合肥", value: 229},
                  //                   {name: "武汉", value: 273},
                  //                   {name: "大庆", value: 279}
                  //               ]
                  //           },
                  //           geoCoord: {
                  //               "海门":[121.15,31.89],
                  //               "鄂尔多斯":[109.781327,39.608266],
                  //               "招远":[120.38,37.35],
                  //               "舟山":[122.207216,29.985295],
                  //               "齐齐哈尔":[123.97,47.33],
                  //               "盐城":[120.13,33.38],
                  //               "赤峰":[118.87,42.28],
                  //               "青岛":[120.33,36.07],
                  //               "乳山":[121.52,36.89],
                  //               "金昌":[102.188043,38.520089],
                  //               "泉州":[118.58,24.93],
                  //               "莱西":[120.53,36.86],
                  //               "日照":[119.46,35.42],
                  //               "胶南":[119.97,35.88],
                  //               "南通":[121.05,32.08],
                  //               "拉萨":[91.11,29.97],
                  //               "云浮":[112.02,22.93],
                  //               "梅州":[116.1,24.55],
                  //               "文登":[122.05,37.2],
                  //               "上海":[121.48,31.22],
                  //               "攀枝花":[101.718637,26.582347],
                  //               "威海":[122.1,37.5],
                  //               "承德":[117.93,40.97],
                  //               "厦门":[118.1,24.46],
                  //               "汕尾":[115.375279,22.786211],
                  //               "潮州":[116.63,23.68],
                  //               "丹东":[124.37,40.13],
                  //               "太仓":[121.1,31.45],
                  //               "曲靖":[103.79,25.51],
                  //               "烟台":[121.39,37.52],
                  //               "福州":[119.3,26.08],
                  //               "瓦房店":[121.979603,39.627114],
                  //               "即墨":[120.45,36.38],
                  //               "抚顺":[123.97,41.97],
                  //               "玉溪":[102.52,24.35],
                  //               "张家口":[114.87,40.82],
                  //               "阳泉":[113.57,37.85],
                  //               "莱州":[119.942327,37.177017],
                  //               "湖州":[120.1,30.86],
                  //               "汕头":[116.69,23.39],
                  //               "昆山":[120.95,31.39],
                  //               "宁波":[121.56,29.86],
                  //               "湛江":[110.359377,21.270708],
                  //               "揭阳":[116.35,23.55],
                  //               "荣成":[122.41,37.16],
                  //               "连云港":[119.16,34.59],
                  //               "葫芦岛":[120.836932,40.711052],
                  //               "常熟":[120.74,31.64],
                  //               "东莞":[113.75,23.04],
                  //               "河源":[114.68,23.73],
                  //               "淮安":[119.15,33.5],
                  //               "泰州":[119.9,32.49],
                  //               "南宁":[108.33,22.84],
                  //               "营口":[122.18,40.65],
                  //               "惠州":[114.4,23.09],
                  //               "江阴":[120.26,31.91],
                  //               "蓬莱":[120.75,37.8],
                  //               "韶关":[113.62,24.84],
                  //               "嘉峪关":[98.289152,39.77313],
                  //               "广州":[113.23,23.16],
                  //               "延安":[109.47,36.6],
                  //               "太原":[112.53,37.87],
                  //               "清远":[113.01,23.7],
                  //               "中山":[113.38,22.52],
                  //               "昆明":[102.73,25.04],
                  //               "寿光":[118.73,36.86],
                  //               "盘锦":[122.070714,41.119997],
                  //               "长治":[113.08,36.18],
                  //               "深圳":[114.07,22.62],
                  //               "珠海":[113.52,22.3],
                  //               "宿迁":[118.3,33.96],
                  //               "咸阳":[108.72,34.36],
                  //               "铜川":[109.11,35.09],
                  //               "平度":[119.97,36.77],
                  //               "佛山":[113.11,23.05],
                  //               "海口":[110.35,20.02],
                  //               "江门":[113.06,22.61],
                  //               "章丘":[117.53,36.72],
                  //               "肇庆":[112.44,23.05],
                  //               "大连":[121.62,38.92],
                  //               "临汾":[111.5,36.08],
                  //               "吴江":[120.63,31.16],
                  //               "石嘴山":[106.39,39.04],
                  //               "沈阳":[123.38,41.8],
                  //               "苏州":[120.62,31.32],
                  //               "茂名":[110.88,21.68],
                  //               "嘉兴":[120.76,30.77],
                  //               "长春":[125.35,43.88],
                  //               "胶州":[120.03336,36.264622],
                  //               "银川":[106.27,38.47],
                  //               "张家港":[120.555821,31.875428],
                  //               "三门峡":[111.19,34.76],
                  //               "锦州":[121.15,41.13],
                  //               "南昌":[115.89,28.68],
                  //               "柳州":[109.4,24.33],
                  //               "三亚":[109.511909,18.252847],
                  //               "自贡":[104.778442,29.33903],
                  //               "吉林":[126.57,43.87],
                  //               "阳江":[111.95,21.85],
                  //               "泸州":[105.39,28.91],
                  //               "西宁":[101.74,36.56],
                  //               "宜宾":[104.56,29.77],
                  //               "呼和浩特":[111.65,40.82],
                  //               "成都":[104.06,30.67],
                  //               "大同":[113.3,40.12],
                  //               "镇江":[119.44,32.2],
                  //               "桂林":[110.28,25.29],
                  //               "张家界":[110.479191,29.117096],
                  //               "宜兴":[119.82,31.36],
                  //               "北海":[109.12,21.49],
                  //               "西安":[108.95,34.27],
                  //               "金坛":[119.56,31.74],
                  //               "东营":[118.49,37.46],
                  //               "牡丹江":[129.58,44.6],
                  //               "遵义":[106.9,27.7],
                  //               "绍兴":[120.58,30.01],
                  //               "扬州":[119.42,32.39],
                  //               "常州":[119.95,31.79],
                  //               "潍坊":[119.1,36.62],
                  //               "重庆":[106.54,29.59],
                  //               "台州":[121.420757,28.656386],
                  //               "南京":[118.78,32.04],
                  //               "滨州":[118.03,37.36],
                  //               "贵阳":[106.71,26.57],
                  //               "无锡":[120.29,31.59],
                  //               "本溪":[123.73,41.3],
                  //               "克拉玛依":[84.77,45.59],
                  //               "渭南":[109.5,34.52],
                  //               "马鞍山":[118.48,31.56],
                  //               "宝鸡":[107.15,34.38],
                  //               "焦作":[113.21,35.24],
                  //               "句容":[119.16,31.95],
                  //               "北京":[116.46,39.92],
                  //               "徐州":[117.2,34.26],
                  //               "衡水":[115.72,37.72],
                  //               "包头":[110,40.58],
                  //               "绵阳":[104.73,31.48],
                  //               "乌鲁木齐":[87.68,43.77],
                  //               "枣庄":[117.57,34.86],
                  //               "杭州":[120.19,30.26],
                  //               "淄博":[118.05,36.78],
                  //               "鞍山":[122.85,41.12],
                  //               "溧阳":[119.48,31.43],
                  //               "库尔勒":[86.06,41.68],
                  //               "安阳":[114.35,36.1],
                  //               "开封":[114.35,34.79],
                  //               "济南":[117,36.65],
                  //               "德阳":[104.37,31.13],
                  //               "温州":[120.65,28.01],
                  //               "九江":[115.97,29.71],
                  //               "邯郸":[114.47,36.6],
                  //               "临安":[119.72,30.23],
                  //               "兰州":[103.73,36.03],
                  //               "沧州":[116.83,38.33],
                  //               "临沂":[118.35,35.05],
                  //               "南充":[106.110698,30.837793],
                  //               "天津":[117.2,39.13],
                  //               "富阳":[119.95,30.07],
                  //               "泰安":[117.13,36.18],
                  //               "诸暨":[120.23,29.71],
                  //               "郑州":[113.65,34.76],
                  //               "哈尔滨":[126.63,45.75],
                  //               "聊城":[115.97,36.45],
                  //               "芜湖":[118.38,31.33],
                  //               "唐山":[118.02,39.63],
                  //               "平顶山":[113.29,33.75],
                  //               "邢台":[114.48,37.05],
                  //               "德州":[116.29,37.45],
                  //               "济宁":[116.59,35.38],
                  //               "荆州":[112.239741,30.335165],
                  //               "宜昌":[111.3,30.7],
                  //               "义乌":[120.06,29.32],
                  //               "丽水":[119.92,28.45],
                  //               "洛阳":[112.44,34.7],
                  //               "秦皇岛":[119.57,39.95],
                  //               "株洲":[113.16,27.83],
                  //               "石家庄":[114.48,38.03],
                  //               "莱芜":[117.67,36.19],
                  //               "常德":[111.69,29.05],
                  //               "保定":[115.48,38.85],
                  //               "湘潭":[112.91,27.87],
                  //               "金华":[119.64,29.12],
                  //               "岳阳":[113.09,29.37],
                  //               "长沙":[113,28.21],
                  //               "衢州":[118.88,28.97],
                  //               "廊坊":[116.7,39.53],
                  //               "菏泽":[115.480656,35.23375],
                  //               "合肥":[117.27,31.86],
                  //               "武汉":[114.31,30.52],
                  //               "大庆":[125.03,46.58]
                  //           }
                  //       },
                  //       {
                  //           name: 'Top5',
                  //           type: 'map',
                  //           mapType: 'china',
                  //           data:[],
                  //           markPoint : {
                  //               symbol:'emptyCircle',
                  //               symbolSize : function (v){
                  //                   return 10 + v/100
                  //               },
                  //               effect : {
                  //                   show: true,
                  //                   shadowBlur : 0
                  //               },
                  //               itemStyle:{
                  //                   normal:{
                  //                       label:{show:false}
                  //                   }
                  //               },
                  //               data : [
                  //                   {name: "廊坊", value: 193},
                  //                   {name: "菏泽", value: 194},
                  //                   {name: "合肥", value: 229},
                  //                   {name: "武汉", value: 273},
                  //                   {name: "大庆", value: 279}
                  //               ]
                  //           }
                  //       }
                  //   ]
                  // };
                  // 为echarts对象加载数据
                  myChart.setOption(option);
                // }
              } else {
                $.plot(elem, sortedSeries, options);
              }
            } catch (e) {
              console.log('flotcharts error', e);
            }

            if (incrementRenderCounter) {
              scope.panelRenderingComplete();
            }
          }

          if (shouldDelayDraw(panel)) {
            // temp fix for legends on the side, need to render twice to get dimensions right
            callPlot(false);
            setTimeout(function() { callPlot(true); }, 50);
            legendSideLastValue = panel.legend.rightSide;
          }
          else {
            callPlot(true);
          }
        }

        function translateFillOption(fill) {
          return fill === 0 ? 0.001 : fill/10;
        }

        function shouldDelayDraw(panel) {
          if (panel.legend.rightSide) {
            return true;
          }
          if (legendSideLastValue !== null && panel.legend.rightSide !== legendSideLastValue) {
            return true;
          }
        }

        function addTimeAxis(options) {
          var ticks = elem.width() / 100;
          var min = _.isUndefined(scope.range.from) ? null : scope.range.from.getTime();
          var max = _.isUndefined(scope.range.to) ? null : scope.range.to.getTime();

          options.xaxis = {
            timezone: dashboard.timezone,
            show: scope.panel['x-axis'],
            mode: "time",
            min: min,
            max: max,
            label: "Datetime",
            ticks: ticks,
            timeformat: time_format(scope.interval, ticks, min, max),
          };
        }

        function addGridThresholds(options, panel) {
          if (_.isNumber(panel.grid.threshold1)) {
            var limit1 = panel.grid.thresholdLine ? panel.grid.threshold1 : (panel.grid.threshold2 || null);
            options.grid.markings.push({
              yaxis: { from: panel.grid.threshold1, to: limit1 },
              color: panel.grid.threshold1Color
            });

            if (_.isNumber(panel.grid.threshold2)) {
              var limit2;
              if (panel.grid.thresholdLine) {
                limit2 = panel.grid.threshold2;
              } else {
                limit2 = panel.grid.threshold1 > panel.grid.threshold2 ?  -Infinity : +Infinity;
              }
              options.grid.markings.push({
                yaxis: { from: panel.grid.threshold2, to: limit2 },
                color: panel.grid.threshold2Color
              });
            }
          }
        }

        function addAnnotations(options) {
          if(!annotations || annotations.length === 0) {
            return;
          }

          var types = {};

          _.each(annotations, function(event) {
            if (!types[event.annotation.name]) {
              types[event.annotation.name] = {
                level: _.keys(types).length + 1,
                icon: {
                  icon: "fa fa-chevron-down",
                  size: event.annotation.iconSize,
                  color: event.annotation.iconColor,
                }
              };
            }

            if (event.annotation.showLine) {
              options.grid.markings.push({
                color: event.annotation.lineColor,
                lineWidth: 1,
                xaxis: { from: event.min, to: event.max }
              });
            }
          });

          options.events = {
            levels: _.keys(types).length + 1,
            data: annotations,
            types: types
          };
        }

        function configureAxisOptions(data, options) {
          var defaults = {
            position: 'left',
            show: scope.panel['y-axis'],
            min: scope.panel.grid.leftMin,
            index: 1,
            logBase: scope.panel.grid.leftLogBase || 1,
            max: scope.panel.percentage && scope.panel.stack ? 100 : scope.panel.grid.leftMax,
          };

          options.yaxes.push(defaults);

          if (_.findWhere(data, {yaxis: 2})) {
            var secondY = _.clone(defaults);
            secondY.index = 2,
            secondY.logBase = scope.panel.grid.rightLogBase || 1,
            secondY.position = 'right';
            secondY.min = scope.panel.grid.rightMin;
            secondY.max = scope.panel.percentage && scope.panel.stack ? 100 : scope.panel.grid.rightMax;
            options.yaxes.push(secondY);

            applyLogScale(options.yaxes[1], data);
            configureAxisMode(options.yaxes[1], scope.panel.y_formats[1]);
          }

          applyLogScale(options.yaxes[0], data);
          configureAxisMode(options.yaxes[0], scope.panel.y_formats[0]);
        }

        function applyLogScale(axis, data) {
          if (axis.logBase === 1) {
            return;
          }

          var series, i;
          var max = axis.max;

          if (max === null) {
            for (i = 0; i < data.length; i++) {
              series = data[i];
              if (series.yaxis === axis.index) {
                if (max < series.stats.max) {
                  max = series.stats.max;
                }
              }
            }
            if (max === void 0) {
              max = Number.MAX_VALUE;
            }
          }

          axis.min = axis.min !== null ? axis.min : 0;
          axis.ticks = [0, 1];
          var nextTick = 1;

          while (true) {
            nextTick = nextTick * axis.logBase;
            axis.ticks.push(nextTick);
            if (nextTick > max) {
              break;
            }
          }

          if (axis.logBase === 10) {
            axis.transform = function(v) { return Math.log(v+0.1); };
            axis.inverseTransform  = function (v) { return Math.pow(10,v); };
          } else {
            axis.transform = function(v) { return Math.log(v+0.1) / Math.log(axis.logBase); };
            axis.inverseTransform  = function (v) { return Math.pow(axis.logBase,v); };
          }
        }

        function configureAxisMode(axis, format) {
          axis.tickFormatter = function(val, axis) {
            return kbn.valueFormats[format](val, axis.tickDecimals, axis.scaledDecimals);
          };
        }

        function time_format(interval, ticks, min, max) {
          if (min && max && ticks) {
            var secPerTick = ((max - min) / ticks) / 1000;

            if (secPerTick <= 45) {
              return "%H:%M:%S";
            }
            if (secPerTick <= 7200) {
              return "%H:%M";
            }
            if (secPerTick <= 80000) {
              return "%m/%d %H:%M";
            }
            if (secPerTick <= 2419200) {
              return "%m/%d";
            }
            return "%Y-%m";
          }

          return "%H:%M";
        }

        function render_panel_as_graphite_png(url) {
          url += '&width=' + elem.width();
          url += '&height=' + elem.css('height').replace('px', '');
          url += '&bgcolor=1f1f1f'; // @grayDarker & @grafanaPanelBackground
          url += '&fgcolor=BBBFC2'; // @textColor & @grayLighter
          url += scope.panel.stack ? '&areaMode=stacked' : '';
          url += scope.panel.fill !== 0 ? ('&areaAlpha=' + (scope.panel.fill/10).toFixed(1)) : '';
          url += scope.panel.linewidth !== 0 ? '&lineWidth=' + scope.panel.linewidth : '';
          url += scope.panel.legend.show ? '&hideLegend=false' : '&hideLegend=true';
          url += scope.panel.grid.leftMin !== null ? '&yMin=' + scope.panel.grid.leftMin : '';
          url += scope.panel.grid.leftMax !== null ? '&yMax=' + scope.panel.grid.leftMax : '';
          url += scope.panel.grid.rightMin !== null ? '&yMin=' + scope.panel.grid.rightMin : '';
          url += scope.panel.grid.rightMax !== null ? '&yMax=' + scope.panel.grid.rightMax : '';
          url += scope.panel['x-axis'] ? '' : '&hideAxes=true';
          url += scope.panel['y-axis'] ? '' : '&hideYAxis=true';

          switch(scope.panel.y_formats[0]) {
            case 'bytes':
              url += '&yUnitSystem=binary';
              break;
            case 'bits':
              url += '&yUnitSystem=binary';
              break;
            case 'bps':
              url += '&yUnitSystem=si';
              break;
            case 'pps':
              url += '&yUnitSystem=si';
              break;
            case 'Bps':
              url += '&yUnitSystem=si';
              break;
            case 'short':
              url += '&yUnitSystem=si';
              break;
            case 'joule':
              url += '&yUnitSystem=si';
              break;
            case 'watt':
              url += '&yUnitSystem=si';
              break;
            case 'ev':
              url += '&yUnitSystem=si';
              break;
            case 'none':
              url += '&yUnitSystem=none';
              break;
          }

          switch(scope.panel.nullPointMode) {
            case 'connected':
              url += '&lineMode=connected';
              break;
            case 'null':
              break; // graphite default lineMode
            case 'null as zero':
              url += "&drawNullAsZero=true";
              break;
          }

          url += scope.panel.steppedLine ? '&lineMode=staircase' : '';

          elem.html('<img src="' + url + '"></img>');
        }

        new GraphTooltip(elem, dashboard, scope, function() {
          return sortedSeries;
        });

        elem.bind("plotselected", function (event, ranges) {
          scope.$apply(function() {
            timeSrv.setTime({
              from  : moment.utc(ranges.xaxis.from).toDate(),
              to    : moment.utc(ranges.xaxis.to).toDate(),
            });
          });
        });
      }
    };
  });

});
