:root {
      --print-scale: 1;
      --print-natural-width-px: 1600px;
      --print-natural-height-px: 1000px;
      --print-left: 0mm;
      --print-top: 0mm;
      --print-scaled-height: 270mm;
    }@page { size: A3 landscape; margin: 3mm; }@media print {
      html, body {
        width: 414mm !important;
        height: 291mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        overflow: hidden !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body { display: block !important; }

      .noise, .topbar, .sidebar, .sidebar-backdrop, .modal-backdrop, .generation-overlay, .toast-stack,
      .view-toolbar .toolbar-spacer, .view-toolbar .chip, .view-toolbar button,
      .hours-balance, .emp-meta { display: none !important; }

      .app, .shell, .content, .view {
        display: block !important;
        width: 414mm !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: #fff !important;
        border: 0 !important;
        box-shadow: none !important;
      }
      .view:not(#calendarView) { display: none !important; }
      #calendarView {
        width: 414mm !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
      }

      .view-toolbar {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 414mm !important;
        height: 9mm !important;
        min-height: 9mm !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        text-align: center !important;
        background: #fff !important;
      }
      .view-toolbar > div:first-child { width: 100% !important; text-align: center !important; }
      .view-title { color:#000 !important; font-size: 10.5pt !important; line-height:1 !important; }
      .view-sub { color:#333 !important; font-size: 5.8pt !important; margin-top:.5mm !important; }

      .calendar-wrap {
        position: relative !important;
        width: 414mm !important;
        height: 279mm !important;
        min-height: 279mm !important;
        max-height: 279mm !important;
        margin: 0 !important;
        overflow: hidden !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: #fff !important;
      }

      table.calendar {
        position: absolute !important;
        top: var(--print-top) !important;
        left: var(--print-left) !important;
        width: var(--print-natural-width-px) !important;
        min-width: var(--print-natural-width-px) !important;
        max-width: none !important;
        height: var(--print-natural-height-px) !important;
        margin: 0 !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        border-spacing: 0 !important;
        transform: scale(var(--print-scale)) !important;
        transform-origin: top left !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
        font-size: 10px !important;
        line-height: 1 !important;
        background: #fff !important;
      }

      .calendar thead { display: table-header-group !important; }
      .calendar tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      .calendar thead th,
      .calendar tbody td:nth-child(-n/**/+3) {
        position: static !important;
        background: #fff !important;
        color: #000 !important;
        box-shadow: none !important;
      }
      .calendar th, .calendar td {
        border: 1px solid #8f98a1 !important;
        overflow: hidden !important;
        color: #000 !important;
        vertical-align: middle !important;
      }
      .calendar thead th { height: 52px !important; padding: 4px 2px !important; }
      .calendar tbody td { height: 45px !important; padding: 2px !important; }

      .calendar th:nth-child(1), .calendar td:nth-child(1) { width: 34px !important; min-width:34px !important; }
      .calendar th:nth-child(2), .calendar td:nth-child(2) { width: 178px !important; min-width:178px !important; padding-left:8px !important; }
      .calendar th:nth-child(3), .calendar td:nth-child(3) { width: 92px !important; min-width:92px !important; }
      .calendar th:nth-child(n/**/+4), .calendar td:nth-child(n/**/+4) { width: 56px !important; min-width:56px !important; }

      .emp-name { color:#000 !important; font-size:10px !important; line-height:1 !important; }
      .emp-index { color:#000 !important; font-size:9px !important; min-width:0 !important; padding:0 !important; background:none !important; }
      .group-cell { min-height:0 !important; height:100% !important; padding:0 !important; }
      .group-badge {
        padding:3px 5px !important; border-radius:4px !important;
        font-size:9px !important; color:#000 !important;
        background:#e8edf2 !important; border:1px solid #9ba5ae !important;
      }
      .cell-button {
        min-height:0 !important; height:100% !important; padding:0 !important;
        display:flex !important; align-items:center !important; justify-content:center !important;
        gap:1px !important; overflow:hidden !important;
      }
      .shift-tag {
        display:inline-block !important; min-width:0 !important; max-width:100% !important;
        padding:2px 2px !important; margin:0 !important; border-radius:3px !important;
        font-size:8.5px !important; line-height:1 !important; font-weight:850 !important;
        white-space:nowrap !important; overflow:hidden !important; text-overflow:clip !important;
      }
      .cell-source, .cell-plus { display:none !important; }
    }
