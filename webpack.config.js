const Path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const MediaQueryPlugin = require('media-query-plugin');

module.exports = {
  entry: './src/js/index.js',
  mode: 'development',
  output: {
    path: Path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[hash].js'
  },
  optimization: {
    minimizer: [new TerserJSPlugin(), new OptimizeCSSAssetsPlugin()],
  },
  devtool: 'source-map',
  devServer: {
    contentBase: './dist'
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      hash: false,
      inject: false,
      template: './src/index.hbs',
    }),
    new MiniCssExtractPlugin({
     filename: 'css/[name].[hash].css',
    }),
    new MediaQueryPlugin({})
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          MediaQueryPlugin.loader
        ]
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: [{
            loader: 'file-loader',
            options: {name: '[name].[hash].[ext]', outputPath: 'webfonts'}
        }]
      },
      {
        test: /\.hbs$/,
        use: ['handlebars-loader', 'extract-loader', 'html-loader'],
      },
      {
        test: /\.svg$/,
        use: [{
            loader: 'file-loader',
            options: {name: '[name].[hash].[ext]', outputPath: 'img'}
        }]
      },
      {
        test: /\.(mp4|webm)$/,
        use: [{
            loader: 'file-loader',
            options: {name: '[name].[hash].[ext]', outputPath: 'media'}
        }]
      }
    ]
  }
};
