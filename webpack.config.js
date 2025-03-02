const
	path = require('path'),
	HtmlWebpackPlugin = require('html-webpack-plugin'),
	MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isProduction = process.env.NODE_ENV == 'production';

module.exports = {

	mode: process.env.NODE_ENV,

	entry: './src/index.ts',

	resolve: {
		extensions: ['.tsx', '.ts', '.js'],
	},

	output: {
		path: path.resolve(__dirname, 'dist'),
	},

	devtool: 'source-map',

	plugins: [

		new HtmlWebpackPlugin({
			filename: 'index.html',
			template: './src/index.ejs',
		}),

		new MiniCssExtractPlugin(),

	],

	module: {
		rules: [

			{
				test: /\.ts$/i,
				use: [

					'ts-loader',

				],
			},

			{
				test: /\.css$/i,
				use: [

					MiniCssExtractPlugin.loader,

					'css-loader',

				],
			},

			{
				test: /\.ejs$/i,
				use: [

					'html-loader',

					'template-ejs-loader',

				]
			},

			{
				test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
				type: 'asset',
			},

			{
				test: /\.svg$/i,
				type: 'asset/source',
			},

		],
	},

};