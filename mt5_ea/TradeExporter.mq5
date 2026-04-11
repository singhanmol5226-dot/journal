//+------------------------------------------------------------------+
//| TradeExporter.mq5                                                |
//| MT5 Expert Advisor — Exports closed trade history to JSON        |
//|                                                                  |
//| INSTALLATION:                                                    |
//|   1. Open MetaTrader 5                                           |
//|   2. Press Ctrl+N to open Navigator                              |
//|   3. Go to File > Open Data Folder                               |
//|   4. Copy this file to MQL5\Experts\                             |
//|   5. In Navigator, right-click Expert Advisors > Refresh         |
//|   6. Drag TradeExporter onto any chart                           |
//|   7. Enable "Allow DLL imports" and "Allow algo trading"         |
//|   8. Press OK — the EA will start exporting every 5 seconds      |
//|                                                                  |
//| OUTPUT FILE: <MT5 Data Folder>\MQL5\Files\mt5_trades.json        |
//| The backend server reads this file for sync.                     |
//+------------------------------------------------------------------+
#property copyright "Trade Journal MT5 Exporter"
#property version   "1.00"
#property strict

// Export interval in milliseconds (5 seconds)
input int ExportIntervalSeconds = 5;
// Maximum number of historical deals to export (0 = all)
input int MaxDeals = 0;

int timerCount = 0;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(ExportIntervalSeconds);
   Print("TradeExporter: Initialized. Exporting to Files/mt5_trades.json every ", ExportIntervalSeconds, " seconds.");
   ExportTrades();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("TradeExporter: Stopped.");
}

//+------------------------------------------------------------------+
//| Timer event — called every ExportIntervalSeconds                 |
//+------------------------------------------------------------------+
void OnTimer()
{
   ExportTrades();
}

//+------------------------------------------------------------------+
//| Main export function                                             |
//+------------------------------------------------------------------+
void ExportTrades()
{
   // Select full history
   if(!HistorySelect(0, TimeCurrent()))
   {
      Print("TradeExporter: Failed to select history.");
      return;
   }

   int totalDeals = HistoryDealsTotal();
   
   // Build JSON
   string json = "{\n";
   
   // Account info section
   json += "  \"account\": {\n";
   json += "    \"login\": " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ",\n";
   json += "    \"name\": \"" + EscapeJson(AccountInfoString(ACCOUNT_NAME)) + "\",\n";
   json += "    \"server\": \"" + EscapeJson(AccountInfoString(ACCOUNT_SERVER)) + "\",\n";
   json += "    \"currency\": \"" + EscapeJson(AccountInfoString(ACCOUNT_CURRENCY)) + "\",\n";
   json += "    \"balance\": " + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\n";
   json += "    \"equity\": " + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",\n";
   json += "    \"profit\": " + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",\n";
   json += "    \"leverage\": " + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "\n";
   json += "  },\n";
   
   json += "  \"exported_at\": \"" + TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES | TIME_SECONDS) + "\",\n";
   json += "  \"total_deals\": " + IntegerToString(totalDeals) + ",\n";
   json += "  \"trades\": [\n";

   // Track which positions we've already processed (to avoid duplicates)
   // We only export DEAL_ENTRY_OUT (close deals) to get complete trades
   bool firstTrade = true;
   
   // Map to collect open/close info per position
   // We'll iterate all deals and match entry/exit by position ID
   long positionIds[];
   int posCount = 0;

   // First pass: collect all position IDs from exit deals
   for(int i = 0; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      
      ENUM_DEAL_ENTRY entryType = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_OUT && entryType != DEAL_ENTRY_INOUT) continue;
      
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      // Skip balance, credit, etc. — only process buy/sell
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;
      
      long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      
      // Check if already in array
      bool found = false;
      for(int j = 0; j < posCount; j++)
         if(positionIds[j] == posId) { found = true; break; }
      
      if(!found)
      {
         ArrayResize(positionIds, posCount + 1);
         positionIds[posCount] = posId;
         posCount++;
      }
   }
   
   // Limit if MaxDeals is set
   int startIdx = 0;
   if(MaxDeals > 0 && posCount > MaxDeals)
      startIdx = posCount - MaxDeals;

   // Second pass: for each position, find its entry and exit deals
   for(int p = startIdx; p < posCount; p++)
   {
      long posId = positionIds[p];
      
      // Find entry deal
      ulong entryTicket = 0;
      ulong exitTicket  = 0;
      double entryPrice = 0, exitPrice = 0, openTime = 0, closeTime = 0;
      double volume = 0, commission = 0, swap = 0, profit = 0;
      double sl = 0, tp = 0;
      string symbol = "";
      string tradeType = "";
      long magicNumber = 0;
      string comment = "";
      
      for(int i = 0; i < totalDeals; i++)
      {
         ulong t = HistoryDealGetTicket(i);
         if(t == 0) continue;
         if(HistoryDealGetInteger(t, DEAL_POSITION_ID) != posId) continue;
         
         ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(t, DEAL_ENTRY);
         ENUM_DEAL_TYPE  dt = (ENUM_DEAL_TYPE)HistoryDealGetInteger(t, DEAL_TYPE);
         
         if(de == DEAL_ENTRY_IN)
         {
            entryTicket  = t;
            entryPrice   = HistoryDealGetDouble(t, DEAL_PRICE);
            openTime     = (double)HistoryDealGetInteger(t, DEAL_TIME);
            volume       = HistoryDealGetDouble(t, DEAL_VOLUME);
            symbol       = HistoryDealGetString(t, DEAL_SYMBOL);
            magicNumber  = HistoryDealGetInteger(t, DEAL_MAGIC);
            comment      = HistoryDealGetString(t, DEAL_COMMENT);
            sl           = HistoryDealGetDouble(t, DEAL_SL);
            tp           = HistoryDealGetDouble(t, DEAL_TP);
            tradeType    = (dt == DEAL_TYPE_BUY) ? "Buy" : "Sell";
            commission  += HistoryDealGetDouble(t, DEAL_COMMISSION);
         }
         else if(de == DEAL_ENTRY_OUT || de == DEAL_ENTRY_INOUT)
         {
            exitTicket  = t;
            exitPrice   = HistoryDealGetDouble(t, DEAL_PRICE);
            closeTime   = (double)HistoryDealGetInteger(t, DEAL_TIME);
            profit      = HistoryDealGetDouble(t, DEAL_PROFIT);
            swap        = HistoryDealGetDouble(t, DEAL_SWAP);
            commission += HistoryDealGetDouble(t, DEAL_COMMISSION);
            if(symbol == "") symbol = HistoryDealGetString(t, DEAL_SYMBOL);
         }
      }
      
      // Skip if we don't have a complete trade
      if(exitTicket == 0 || entryTicket == 0) continue;
      
      // Format timestamps
      datetime openDt  = (datetime)openTime;
      datetime closeDt = (datetime)closeTime;
      string openTimeStr  = TimeToString(openDt,  TIME_DATE | TIME_MINUTES | TIME_SECONDS);
      string closeTimeStr = TimeToString(closeDt, TIME_DATE | TIME_MINUTES | TIME_SECONDS);
      // Convert space to T for ISO-like format
      StringReplace(openTimeStr,  " ", "T");
      StringReplace(closeTimeStr, " ", "T");

      if(!firstTrade) json += ",\n";
      firstTrade = false;
      
      json += "    {\n";
      json += "      \"ticket\": " + IntegerToString(posId) + ",\n";
      json += "      \"symbol\": \"" + EscapeJson(symbol) + "\",\n";
      json += "      \"trade_type\": \"" + tradeType + "\",\n";
      json += "      \"volume\": " + DoubleToString(volume, 2) + ",\n";
      json += "      \"open_price\": " + DoubleToString(entryPrice, 5) + ",\n";
      json += "      \"close_price\": " + DoubleToString(exitPrice, 5) + ",\n";
      json += "      \"open_time\": \"" + openTimeStr + "\",\n";
      json += "      \"close_time\": \"" + closeTimeStr + "\",\n";
      json += "      \"stop_loss\": " + DoubleToString(sl, 5) + ",\n";
      json += "      \"take_profit\": " + DoubleToString(tp, 5) + ",\n";
      json += "      \"commission\": " + DoubleToString(commission, 2) + ",\n";
      json += "      \"swap\": " + DoubleToString(swap, 2) + ",\n";
      json += "      \"profit\": " + DoubleToString(profit, 2) + ",\n";
      json += "      \"magic_number\": " + IntegerToString(magicNumber) + ",\n";
      json += "      \"comment\": \"" + EscapeJson(comment) + "\"\n";
      json += "    }";
   }
   
   json += "\n  ]\n}";
   
   // Write to file
   int fileHandle = FileOpen("mt5_trades.json", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(fileHandle == INVALID_HANDLE)
   {
      Print("TradeExporter: ERROR — Cannot open mt5_trades.json for writing. Error: ", GetLastError());
      return;
   }
   
   FileWriteString(fileHandle, json);
   FileClose(fileHandle);
   
   Print("TradeExporter: Exported ", posCount, " closed trades to mt5_trades.json");
}

//+------------------------------------------------------------------+
//| Escape special JSON characters in a string                       |
//+------------------------------------------------------------------+
string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}
