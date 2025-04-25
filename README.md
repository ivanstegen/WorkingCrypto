# Cryptocurrency Tracker

A modern, responsive cryptocurrency tracking application built with Next.js, TypeScript, and Tailwind CSS. Track real-time cryptocurrency prices, market data, and trends with a beautiful and intuitive interface.

## Features

- 🔍 Real-time cryptocurrency search with suggestions
- 📊 Detailed cryptocurrency information and charts
- 💰 Multiple currency support (USD, EUR, GBP, JPY)
- ⭐ Favorite cryptocurrencies
- 📱 Responsive design for all devices
- 🔄 Real-time price updates
- 📈 Interactive price charts
- 🔒 Secure API integration with multiple fallback sources

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/ui
- **State Management**: React Context
- **API Integration**: CoinGecko API with fallback to CoinCap and CryptoCompare
- **Charts**: TradingView Lightweight Charts
- **Icons**: Lucide Icons

## Getting Started

### Prerequisites

- Node.js 18.0 or later
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/cryptocurrency-tracker.git
   cd cryptocurrency-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env.local` file in the root directory and add your API keys:
   ```
   NEXT_PUBLIC_COINGECKO_API_KEY=your_coingecko_api_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
cryptocurrency-tracker/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── crypto/            # Cryptocurrency detail pages
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/               # UI components
│   ├── charts/           # Chart components
│   └── ...               # Other components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions and API clients
├── types/                # TypeScript type definitions
└── public/               # Static assets
```

## API Integration

The application uses multiple cryptocurrency data sources with automatic fallback:

1. CoinGecko (Primary)
2. CoinCap (Fallback)
3. CryptoCompare (Fallback)

This ensures high availability and reliability of data even if one API is down.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [CoinGecko](https://www.coingecko.com/) for providing the cryptocurrency data API
- [TradingView](https://www.tradingview.com/) for the lightweight charts library
- [Shadcn/ui](https://ui.shadcn.com/) for the beautiful UI components 