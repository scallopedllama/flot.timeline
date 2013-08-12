// float.timeline.js
// A series of enhancements made to flot that add
//    an overview graph
//    ability to show / hide series by clicking them in the legend
//    automatic Y-axis scaling when selecting a range in the overview graph
//    tooltip showing all data for that point in time
//    Support for 'this-unit' series containing the most recent data, separated out since it is not final data
//    Automatic data update via AJAX
//
// I acknowledge that this should all be in a flot plugin and that in order to use this, it would be a bit of work to pull the customizations out.
// Mostly I'm putting this out there in case anybody else was trying to mimic the Google Docs Timeline graph.
// Hopefully I'll have the time in the future to make this into a proper flot plugin.
//
// This code requires jQuery, flot, flot.navigate, flot.time, and flot.selection.
//
// Joe Balough
// 2013
// GPL v2

function AddGraph(graphData)
{
	var _thisGraphObject = $.parseJSON(graphData);
	// _thisGraphObject:
	// array (
	//   'id'       => 'foo',                                     // Graph div id
	//   'name'     => 'Foo Statistics',                          // String title for graph
	//   'type'     => '(bar|line)'                               // Graph type. Can be bar or line`
	//   'series'   => array('Series 1', 'Series 2', 'Series 3'), // The series (not including this minute)
	//   'sepLastPoint'=> (TRUE|FALSE),                              // TRUE to include extra series for this minute
	//   'op'       => 'foo',                                     // graph argument to provide to operations.php
	//   'barWidth' => $time_unit_in_ms,                          // Width of each point in ms
	//   'units'    => 'ms',                                      // String to be used for units
	//   'colors'   => array('####', '####', ...),                // Data series colors
	// )
	var _thisGraph, _thisGraphData, _thisGraphDisabledData = [], _thisGraphOptions, thisGraphOverviewOptions, _thisGraphOverview;
	
	$(document).ready(function()
	{
		
		_thisGraphOptions = {
			xaxis:  { mode: 'time' },
			yaxis:  { panRange: false },
			grid:   { hoverable: true },
			pan:    { interactive: true },
			colors: _thisGraphObject.colors,
			legend: { position: "nw" }
		};
		_thisGraphOverviewOptions = {
			xaxis:     { ticks: [], mode: 'time' },
			yaxis:     { ticks: [], min: 0, autoscaleMargin: 0.1 },
			lines:     { show: true },
			grid:      { hoverable: true },
			colors:    _thisGraphObject.colors,
			selection: { mode: "x" },
			legend:    { show: false }
		};
		if (_thisGraphObject.type == 'bar')
			_thisGraphOptions.bars =  { show: true, barWidth: _thisGraphObject.barWidth };
		else if (_thisGraphOptions.type == 'line')
			_thisGraphOptions.lines = { show: true };
		
		$('#' + _thisGraphObject.id + '-graph-t').fadeIn();
		$.ajax({
			url: 'operations.php',
			data: {graph: _thisGraphObject.op},
			method: 'GET',
			dataType: 'json',
			error: AjaxError,
			success: function(newData) {
				ClearError('ajax-' + _thisGraphObject.id + '-graph');
				
				var minVal = Number.MAX_VALUE;
				var maxVal = -1;
				for (i in newData)
				{
					for (j in newData[i].data)
					{
						var timestamp = ConvertToFakeUTC(newData[i].data[j][0], _thisGraphObject.barWidth);
						if (timestamp > maxVal) maxVal = new Date(timestamp.getTime());
						if (timestamp < minVal) minVal = new Date(timestamp.getTime());
						newData[i].data[j][0] = timestamp;
					}
				}
				_thisGraphData = newData;
				
				// Set data ranges on the plot
				maxVal.setHours(maxVal.getHours() + 1);
				var midVal = new Date(maxVal.getTime());
				midVal.setDate(midVal.getDate() - 1);
				_thisGraphOptions.xaxis.min = midVal;
				_thisGraphOptions.xaxis.max = maxVal;
				_thisGraphOptions.panRange = [minVal, maxVal];
				
				// Make the graph
				$('#' + _thisGraphObject.id + '-graph > p').remove();
				_thisGraph = $.plot($('#' + _thisGraphObject.id + '-graph-c'), _thisGraphData, _thisGraphOptions);
				_thisGraphOverview = $.plot($('#' + _thisGraphObject.id + '-graph-overview'), _thisGraphData, _thisGraphOverviewOptions);
				// Call the Graph PlotPan Handler to get the selection correct on the overview
				ThisGraphPlotPanHandler(null, _thisGraph);
				
				UpdateDateSpan($('#' + _thisGraphObject.id + '-graph-date'));
				$('#' + _thisGraphObject.id + '-graph-t').fadeOut();
				
				InstallSeriesHiders();
			}
		});
		
		
		
		/**
		* Graph Series Hiding handler
		*/
		// Register the same click handler for each label of this chart
		function InstallSeriesHiders()
		{
			$.each(_thisGraphData, function(indexInArray, series) {
				// Get the DOM object for this legend entry
				var legendItem = $('td.legendLabel:Contains(' + series.label + ')').first().parent();
				// Remove any previously bound click events
				legendItem.unbind('click');
				
				// Determine if going to be enabled and update the text decoration for this legend entry here
				var enabled = typeof _thisGraphDisabledData[indexInArray] !== 'undefined';
				legendItem.css('text-decoration', ((enabled) ? 'line-through' : '') );
				
				legendItem.click(function () {
					if (enabled)
					{
						// Pull the series in question out of _thisGraphDisabledData and store in _thisGraphData
						_thisGraphData[indexInArray] = {
							label: _thisGraphDisabledData[indexInArray].label,
							data:  _thisGraphDisabledData[indexInArray].data
						};
						// Remove this entry from disabled graph data entirely since the presence of its label is
						// what indicates that this series is disabled.
						_thisGraphDisabledData.splice(indexInArray, 1);
					}
					else
					{
						// Pull the series in question out of _thisGraphData and store in _thisGraphDisabledData
						_thisGraphDisabledData[indexInArray] = {
							label: _thisGraphData[indexInArray].label,
							data:  _thisGraphData[indexInArray].data
						};
						_thisGraphData[indexInArray].data = [];
					}
					_thisGraph.setData(_thisGraphData);
					// Automatically adjust the Y axis and re-install these series handlers
					AdjustYaxis();
				});
			});
		}
		
		
		/**
		 * Graph overview function
		 * 
		 * Connects the overview to the big graph, changing the zoom and the scaling
		 */
		
		$('#' + _thisGraphObject.id + '-graph-c').bind("plotselected", function (event, ranges) {
			// Find the minimum and maximum y value for the data points in the selected range
			AdjustYaxis();
			_thisGraphOverview.setSelection(ranges, true);
		});
		$('#' + _thisGraphObject.id + '-graph-overview').bind("plotselected", function (event, ranges) {
			_thisGraph.setSelection(ranges);
		});
		
		
		/**
		 * Autoscale Y-axis function
		 * Scans the selected points in the overview graph to adjust the y-axis scale
		 * and redraws the graph.
		 */
		function AdjustYaxis()
		{
			// Get the current selection from the overview
			var ranges = _thisGraphOverview.getSelection();
			
			// Find the minimum and maximum y value for the data points in the selected range
			var ymin, ymax;
			// For each data series
			$.each(_thisGraphData, function(e, series) {
				// For each point
				$.each(series.data, function(e1, point) {
					// If it's in the range selected
					if ((point[0] >= ranges.xaxis.from) && (point[0] <= ranges.xaxis.to))
					{
						// Determine if it's the new min and max
						if (ymax == null || point[1] > ymax) ymax = point[1];
						if (ymin == null || point[1] < ymin) ymin = point[1];
					}
				});
			});
			// Update the ranges with the min and max, then load it into the graph
			ranges.yaxis.from = ymin;
			ranges.yaxis.to = ymax * 1.1;
			_thisGraph = $.plot('#' + _thisGraphObject.id + '-graph-c', _thisGraphData, $.extend(true, {}, _thisGraphOptions, {
				xaxis: { min: ranges.xaxis.from, max: ranges.xaxis.to },
				yaxis: { min: ranges.yaxis.from, max: ranges.yaxis.to }
			}));
			InstallSeriesHiders();
		}
		
		
		/**
		 * Graph plotpan function
		 * 
		 * Run whenever the main graph if pan'd. Updates the selection in the overview
		 */
		function ThisGraphPlotPanHandler(e, plot)
		{
			var newMin = plot.getAxes().xaxis.options.min;
			var newMax = plot.getAxes().xaxis.options.max;
			var ranges = { xaxis: { from: newMin, to: newMax } };
			_thisGraphOverview.setSelection(ranges, true);
			InstallSeriesHiders();
		}
		$('#' + _thisGraphObject.id + '-graph-c').bind("plotpan",ThisGraphPlotPanHandler);
		
		
		/**
		 * Graph tooltip function
		 * 
		 * Adds a tooltip when hovering points in the graph
		 */
		var _thisGraphPreviousPoint = null;
		$('#' + _thisGraphObject.id + '-graph-c').bind("plothover", function (event, pos, item) {

			if (item) {
				if (_thisGraphPreviousPoint != item.dataIndex) {
					_thisGraphPreviousPoint = item.dataIndex;
					var index = item.dataIndex;
					var date = new Date(item.datapoint[0]);
					var tooltipString = "";
					
					// If the point being hovered is in a 'current-hour' series, get the data from the correct series
					var indexOffset = 0;
					var pointIndex = index;
					if (item.series.data.length == 1)
					{
						indexOffset = _thisGraphObject.series.length;
						pointIndex = 0;
					}
					
					// Build a string containing all the series data in one tooltip
					var i = 0;
					for (s in _thisGraphObject.series)
					{
						var enabled = typeof _thisGraphDisabledData[s] === 'undefined';
						var data = (enabled) ? _thisGraphData[indexOffset + i].data[pointIndex][1] : _thisGraphDisabledData[indexOffset + i].data[pointIndex][1];
						tooltipString += '<br>' + _thisGraphObject.series[s] + ": " + data + ' ' + _thisGraphObject.units;
						i++;
					}
					
					$('#' + _thisGraphObject.id + '-tooltip').remove();
					
					var dateString = (date.getUTCMonth() + 1) + '/' + date.getUTCDate() + ' ';
					if(_thisGraphObject.barWidth < 60000)
						dateString += FormatHours(date.getUTCHours(), date.getMinutes(), date.getSeconds());
					else if (_thisGraphObject.barWidth < 3600000)
						dateString += FormatHours(date.getUTCHours(), date.getMinutes());
					else
						dateString += FormatHours(date.getUTCHours());
					$('<div id="' + _thisGraphObject.id + '-tooltip">' + dateString + tooltipString + '</div>').css( {
						position: 'absolute',
						display: 'none',
						top: item.pageY + 5,
						left: item.pageX + 5,
						border: '1px solid #fdd',
						padding: '2px',
						'background-color': '#fee',
						opacity: 0.80
					}).appendTo("body").fadeIn(200);
				}
			}
			else {
					$('#' + _thisGraphObject.id + '-tooltip').remove();
					_thisGraphPreviousPoint = null;
			}
		});
		
		/**
		 * Graph Update Function
		 * 
		 * Set up on an interval, this function is responsible for updating the data in the graph.
		 */
		function thisGraphInterval() {
			$('#' + _thisGraphObject.id + '-graph-t').fadeIn();
			// Need to get the timestamp of the last datapoint. This will either be in the first this-timeunit series or in the first series, depending on if sepLastPoint is set.
			var lastPointSeriesIndex = (_thisGraphObject.sepLastPoint) ? _thisGraphObject.series.length : 0;
			var enabled = typeof _thisGraphDisabledData[lastPointSeriesIndex] === 'undefined';
			var lastPointDataIndex   = (_thisGraphObject.sepLastPoint) ? 0 : ( (enabled) ? _thisGraphData[lastPointSeriesIndex].data.length - 1 : _thisGraphDisabledData[lastPointSeriesIndex].data.length - 1 );
			var lastPointTime = (enabled) ? _thisGraphData[lastPointSeriesIndex].data[lastPointDataIndex][0].toISOString() : _thisGraphDisabledData[lastPointSeriesIndex].data[lastPointDataIndex][0].toISOString();
			
			// Remove any previously bound click events
			$('td.legendLabel').parent().unbind('click');
			
			// Request all data since and including the last time point. This will replace the current last datapoint, since that data may not be correct anymore
			$.ajax({
				url: 'operations.php',
				data: {graph: _thisGraphObject.op, startdate: lastPointTime},
				method: 'GET',
				dataType: 'json',
				error: AjaxError,
				success: function(newData, ajaxResult) {
					if (ajaxResult != 'success' || newData == undefined || newData == null)
					{
						SetError('ajax-' + _thisGraphObject.id + '-graph', 'red', 'Could not query ' + _thisGraphObject.name + ' update from the server.', 'Verify the server is not down.');
						return;
					}
					else
						ClearError('ajax-' + _thisGraphObject.id + '-graph');
					
					//console.log(_thisGraphObject.id, newData);
					
					// Combine the data before loading the new stuff
					for (s in _thisGraphDisabledData)
					{
						_thisGraphData[s] = {
							label: _thisGraphDisabledData[s].label,
							data:  _thisGraphDisabledData[s].data
						};
					}
					
					// If sepLastPoint is set, the last point in the data goes into a different series.
					// If the hour hasn't rolled over, there should only be a single point returned
					// If the hour has rolled over, there will be two. One to go on the end of the other data, one to replace this hour
					
					// If there is not a separate series for the last point, always remove the last from the series to replace with the new correct value coming back
					if (!_thisGraphObject.sepLastPoint)
					{
						var i = 0;
						for (s in _thisGraphObject.series)
							_thisGraphData[i++].data.pop();
					}
					
					// Check for rollover and push that point on the previous data
					var rolloverThreshold = (_thisGraphObject.sepLastPoint) ? 0 : 1;
					if (newData[0].data.length > rolloverThreshold)
					{
						// Scroll the graph left 1 bar width
						var barWidth = _thisGraphObject.barWidth * _thisGraph.getXAxes()[0].scale;
						_thisGraph.pan({left: barWidth});
						var i = 0;
						for (s in _thisGraphObject.series)
						{
							var thisPoint = newData[i].data.shift();
							_thisGraphData[i].data.push([ ConvertToFakeUTC(thisPoint[0], _thisGraphObject.barWidth), thisPoint[1] ]);
							i++;
						}
						
					}
					
					// Replace the current time point with what we got
					var i = 0;
					for (s in _thisGraphObject.series)
					{
						var indexOffset = 0;
						if (_thisGraphObject.sepLastPoint)
						{
							indexOffset = _thisGraphObject.series.length;
							_thisGraphData[indexOffset + i].data.pop();
						}
						var indexOffset = _thisGraphObject.sepLastPoint ? _thisGraphObject.series.length : 0;
						var j = 0;
						for (p in newData[indexOffset + i].data)
						{
							_thisGraphData[indexOffset + i].data.push([ ConvertToFakeUTC(newData[indexOffset + i].data[j][0], _thisGraphObject.barWidth), newData[indexOffset + i].data[j][1] ]);
							j++;
						}
						i++;
					}
					
					// Redraw the overview with all the new data
					_thisGraphOverview.setData(_thisGraphData);
					_thisGraphOverview.draw();
					
					// Remove the disabled data
					for (s in _thisGraphDisabledData)
					{
						_thisGraphDisabledData[s] = {
							label: _thisGraphData[s].label,
							data:  _thisGraphData[s].data
						};
						_thisGraphData[s].data = [];
					}
					
					// Redraw the graph
					_thisGraph.setData(_thisGraphData);
					_thisGraph.draw();
					InstallSeriesHiders();
					
					UpdateDateSpan($('#' + _thisGraphObject.id + '-graph-date'));
					$('#' + _thisGraphObject.id + '-graph-t').fadeOut();
				}
			});
		}
		// Set up the Graph Interval
		thisUpdateIntervalId = setInterval(thisGraphInterval, _graphUpdateInterval);
		_graphUpdateIntervals.push(thisUpdateIntervalId);
		
		// Add another click handler to the Resume link to restart this update interval
		$('#resume').click(function() {
			thisUpdateIntervalId = setInterval(thisGraphInterval, _graphUpdateInterval);
			_graphUpdateIntervals.push(thisUpdateIntervalId);
		});
	});
}


// Make the timestamp appear to be in UTC (when it is not) so that when
// Flot displays it in UTC, it's the correct time in EST.
// Not sure how this will look on those lost / gained hours during the change.
function ConvertToFakeUTC(timestamp, barWidth)
{
	var newDate = new Date(timestamp * 1000);
	switch (barWidth)
	{
		case 3600000:
			newDate.setMinutes(0);
		case 60000:
			newDate.setSeconds(0);
		case 1000:
			newDate.setMilliseconds(0);
	}
	newDate.setHours(newDate.getHours() - (newDate.getTimezoneOffset() / 60));
	return newDate;
}

