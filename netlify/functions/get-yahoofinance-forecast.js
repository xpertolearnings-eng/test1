const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Helper to call the Gemini API
async function callGemini(prompt, apiKey) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
        },
    };
    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error("Gemini API Error:", errorBody);
            return null;
        }
        const result = await apiResponse.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        console.error("Gemini Function Error:", error);
        return null;
    }
}

// Helper to fetch data from the NEW Yahoo Finance API
async function fetchYahooFinanceData(symbol, apiKey) {
    const url = `https://yfinance-api.p.rapidapi.com/v11/finance/quoteSummary/${symbol}?modules=price,summaryDetail,financialData`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'yfinance-api.p.rapidapi.com'
        }
    };
    // --- DEBUGGING: Log the options being sent to the API ---
    console.log("Attempting to fetch from Yahoo Finance with options:", JSON.stringify(options));
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
             const errorBody = await response.text();
             console.error("Yahoo Finance API Error Response:", errorBody);
             return null;
        }
        const result = await response.json();
        return result?.quoteSummary?.result[0] || null;
    } catch (error) {
        console.error('Error fetching from Yahoo Finance API:', error);
        return null;
    }
}


// Main serverless function handler
exports.handler = async function (event) {
    // --- START DEBUGGING BLOCK ---
    console.log("--- Executing get-yahoofinance-forecast function (v2) ---");
    const geminiKeyExists = !!process.env.GEMINI_API_KEY;
    const yahooKeyExists = !!process.env.YAHOO_FINANCE_API_KEY;
    
    console.log("Is GEMINI_API_KEY set?", geminiKeyExists);
    console.log("Is YAHOO_FINANCE_API_KEY set?", yahooKeyExists);
    
    if (yahooKeyExists) {
        const key = process.env.YAHOO_FINANCE_API_KEY;
        console.log(`Yahoo Key starts with: ${key.substring(0, 5)}... and ends with: ...${key.substring(key.length - 5)}`);
    } else {
        console.log("Yahoo Finance API Key is MISSING from environment variables.");
    }
    // --- END DEBUGGING BLOCK ---

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { symbol, timeframe, steps } = JSON.parse(event.body);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const yahooFinanceApiKey = process.env.YAHOO_FINANCE_API_KEY;

    if (!geminiApiKey || !yahooFinanceApiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: "API service is not configured correctly. Missing required keys." }) };
    }

    try {
        const yahooData = await fetchYahooFinanceData(symbol, yahooFinanceApiKey);

        if (!yahooData) {
            throw new Error(`Could not retrieve data from Yahoo Finance for symbol: ${symbol}. This symbol may not be valid.`);
        }
        
        const priceData = yahooData.price;
        const summaryData = yahooData.summaryDetail;
        const financialData = yahooData.financialData;

        const analysisContext = {
            displayName: priceData.longName || priceData.shortName,
            currency: priceData.currency,
            regularMarketPrice: priceData.regularMarketPrice?.raw,
            fiftyTwoWeekRange: `${summaryData.fiftyTwoWeekLow?.raw} - ${summaryData.fiftyTwoWeekHigh?.raw}`,
            averageDailyVolume10Day: summaryData.averageDailyVolume10Day?.raw,
            averageAnalystRating: financialData.recommendationKey,
            targetPrice: {
                mean: financialData.targetMeanPrice?.raw,
                high: financialData.targetHighPrice?.raw,
                low: financialData.targetLowPrice?.raw
            }
        };
        
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;

        const prompt = `
            You are a sophisticated financial analyst AI. Your task is to interpret real-world financial data from Yahoo Finance and generate a plausible, simulated price forecast chart and a set of metrics.

            **IMPORTANT RULES:**
            1. The data you generate is a simulation for a trading journal. It is NOT real financial advice.
            2. You MUST return the data in the specified JSON format and nothing else.
            3. Base your forecast on the provided Yahoo Finance data.
            4. The last historical data point in your 'chartData' MUST have a price equal to the 'regularMarketPrice' from the provided Yahoo data.
            5. The historical data's timeline MUST end on the provided "Current Date".
            6. Generate 50 historical data points and exactly ${steps} forecast data points.
            7. The "metrics" values must be consistent with your generated chart data.
            8. The "trend" MUST be either "Bullish" or "Bearish".

            **Current Date:** ${currentDate}

            **Yahoo Finance Data for ${symbol}:**
            ${JSON.stringify(analysisContext, null, 2)}

            **Required JSON Output Format:**
            {
              "displayName": "${analysisContext.displayName}",
              "currency": "${analysisContext.currency}",
              "chartData": [ {"date": "YYYY-MM-DD", "price": 100.00}, ... ],
              "metrics": { "trend": "Bullish", "avgPercentageChange": 1.23, "volatility": 2.34, "cumulativeReturn": 5.67, "concentrationPrice": 105.50, "maxDrawdown": -3.45 }
            }
        `;

        const aiResponse = await callGemini(prompt, geminiApiKey);
        if (!aiResponse) {
            throw new Error("The AI model did not return a valid response after processing Yahoo Finance data.");
        }

        const parsedData = JSON.parse(aiResponse);
        return {
            statusCode: 200,
            body: JSON.stringify(parsedData),
        };

    } catch (error) {
        console.error("Error in get-yahoofinance-forecast function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
