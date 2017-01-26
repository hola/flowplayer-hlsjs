'use strict';

var fs = require('fs')
  , path = require('path')
  , webpack = require('webpack')
  , console = require('console')
  , WrapperPlugin = require('wrapper-webpack-plugin')
  , headerComment = fs.readFileSync('./headConditionalComment.js')
  , footerComment = fs.readFileSync('./footConditionalComment.js')
  , exec = require('child_process').execSync
  , gitId
  , banner = ''
  , bannerAppend = false
  , lines = fs.readFileSync('./flowplayer.hlsjs.js', 'utf8').split('\n');

try {
    gitId = exec('git rev-parse --short HEAD').toString('utf8').trim();
} catch (ignore) {
    console.warn('unable to determine git revision');
}

lines.forEach(function (line) {
    if (line === '/*!') {
        bannerAppend = true;
    }
    if (bannerAppend) {
        bannerAppend = line.indexOf('$GIT_ID$') < 0;
        if (gitId) {
            line = line.replace('$GIT_ID$', gitId);
        }
        banner += line + (bannerAppend ? '\n' : '\n\n*/');
    }
});

module.exports = {
  entry: {'flowplayer.hlsjs': ['./flowplayer.hlsjs.js']},
  output: {
    library: 'HolaFlowplayerHlsProvider',
    path: path.join(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'umd',
  },
  module: {
    loaders: [{
      test: ,
      loader: 'transform-loader?browserify-versionify',
    }],
  },
  plugins: [
    new webpack.optimize.OccurrenceOrderPlugin(true),
    new WrapperPlugin({header: headerComment, footer: footerComment}),
    new webpack.BannerPlugin(banner, {raw: true})
  ]
};
