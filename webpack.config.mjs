import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import CopyWebpackPlugin from 'copy-webpack-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appConfig = JSON.parse(readFileSync('./src/config.json', 'utf-8'))
const serverPort = appConfig.serverPort || 3000
const isProduction = process.env.NODE_ENV === 'production'

export default {
  mode: isProduction ? 'production' : 'development',
  devtool: isProduction ? 'source-map' : 'cheap-module-source-map',
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    publicPath: process.env.PUBLIC_URL ? process.env.PUBLIC_URL + '/' : '/',
    filename: isProduction
      ? 'static/js/[name].[contenthash:8].js'
      : 'static/js/bundle.js',
    chunkFilename: isProduction
      ? 'static/js/[name].[contenthash:8].chunk.js'
      : 'static/js/[name].chunk.js',
    assetModuleFilename: 'static/media/[name].[hash][ext]',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|mjs|jsx)$/,
        include: path.resolve(__dirname, 'src'),
        use: {
          loader: 'babel-loader',
          options: {
            plugins: ['babel-plugin-react-compiler'],
            presets: [
              ['@babel/preset-react', { runtime: 'automatic' }],
              '@babel/preset-typescript',
            ],
          },
        },
      },
      // .wasm files are loaded as URLs and fetched manually (not as async WASM modules)
      { test: /\.wasm$/, type: 'asset/resource' },
      {
        test: /\.css$/,
        use: isProduction
          ? [MiniCssExtractPlugin.loader, 'css-loader']
          : ['style-loader', 'css-loader'],
        sideEffects: true,
      },
      {
        exclude: [
          /^$/,
          /\.(tsx|ts|js|mjs|jsx)$/,
          /\.html$/,
          /\.json$/,
          /\.wasm$/,
          /\.css$/,
        ],
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: './public/index.html' }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public',
          to: '.',
          globOptions: { ignore: ['**/index.html'] },
        },
      ],
    }),
    ...(isProduction
      ? [
          new MiniCssExtractPlugin({
            filename: 'static/css/[name].[contenthash:8].css',
          }),
        ]
      : []),
  ],
  devServer: {
    host: process.env.HOST || '127.0.0.1',
    port: parseInt(process.env.PORT || '3001'),
    allowedHosts: 'all',
    hot: true,
    historyApiFallback: true,
    proxy: [
      { context: ['/api'], target: `http://localhost:${serverPort}`, ws: true },
    ],
    static: { directory: path.resolve(__dirname, 'public') },
    devMiddleware: { stats: 'errors-warnings' },
    client: { logging: 'warn' },
  },
  performance: false,
  stats: 'errors-warnings',
}
