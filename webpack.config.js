const Path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const SriPlugin = require('webpack-subresource-integrity');
const WebappWebpackPlugin = require('webapp-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  mode: 'development',
  output: {
    path: Path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    crossOriginLoading: 'anonymous'
  },
  optimization: {
    minimizer: [new TerserJSPlugin(), new OptimizeCSSAssetsPlugin()],
    splitChunks: {chunks: 'all'}
  },
  devtool: 'source-map',
  devServer: {
    contentBase: './dist'
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      hash: false,
      inject: true,
      template: './src/index.html',
    }),
    new MiniCssExtractPlugin({
     filename: 'css/[name].[contenthash].css',
    }),
    new SriPlugin({hashFuncNames: ['sha256', 'sha384']}),
    new WebappWebpackPlugin({
      logo: './src/img/favicon.png',
      prefix: 'img/favicon-[hash]/',
      favicons: {
        appName: 'Superscheda',
        lang: 'it-IT',
        appleStatusBarStyle: 'black',
        start_url: null,  // Explicitly disable this because the web app should pick up the access token
        icons: {
          android: true,
          appleIcon: true,
          appleStartup: false,
          coast: true,
          favicons: true,
          firefox: true,
          yandex: true,
          windows: true
        }
      }
    }),
    new WebappWebpackPlugin({
      logo: './src/img/startup.png',
      prefix: 'img/startup-[hash]/',
      favicons: {
        icons: {
          android: false,
          appleIcon: false,
          appleStartup: true,
          coast: false,
          favicons: false,
          firefox: false,
          yandex: false,
          windows: false
        }
      }
    })
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: [{
            loader: 'file-loader',
            options: {name: '[name].[contenthash].[ext]', outputPath: 'webfonts'}
        }]
      },
      {
        test: /\.html$/,
        use: {
          loader: 'html-loader',
          options: {
            attrs: ['img:src', 'source:src']
          }
        }
      },
      {
        test: /\.scss$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {plugins: () => [require('precss'), require('autoprefixer')]}
          },
          'sass-loader'
        ],
      },
      {
        test: /\.svg$/,
        use: [{
            loader: 'file-loader',
            options: {name: '[name].[contenthash].[ext]', outputPath: 'img'}
        }]
      },
      {
        test: /\.(mp4|webm)$/,
        use: [{
            loader: 'file-loader',
            options: {name: '[name].[contenthash].[ext]', outputPath: 'media'}
        }]
      },
      {
         test: /\.js$/,
         exclude: /node_modules/,
         use: {
           loader: 'babel-loader',
           options: {
             presets: ['@babel/preset-env'],
             plugins: ['@babel/plugin-transform-runtime', '@babel/plugin-syntax-dynamic-import']
           }
         }
       }
    ]
  }
};
