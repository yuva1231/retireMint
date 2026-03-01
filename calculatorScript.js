/*
  calculatorScript.js - RetireMINT Calculator
  Calculations:
  - Accumulation phase: year-by-year compounding with growing contributions
  - Savings needed: Present Value of a Growing Annuity (inflation-adjusted drawdown)
  - Monthly income views: target vs. 4% sustainable withdrawal rule
*/

$(document).ready(function () {
    addNavListeners();
    fetchInterestRates();
    $("#exportPDF").on("click", exportToPDF);

    // Auto-format numeric inputs with commas while typing
    $('input[type="text"]').on('input', function () {
        const id = this.id;
        // Only format dollar amount fields (not percentage or age fields)
        const dollarFields = ['yearlyIncome', 'currentSavings', 'annualRetirementSpending'];
        if (dollarFields.includes(id)) {
            let raw = $(this).val().replace(/[^0-9]/g, '');
            if (raw !== '') {
                $(this).val(parseInt(raw, 10).toLocaleString());
            }
        }
    });

    $("#retirementForm").submit(function (event) {
        event.preventDefault();

        function parseDollar(id) {
            return parseFloat($('#' + id).val().replace(/[^0-9.]/g, '')) || 0;
        }
        function parseNum(id) {
            return parseFloat($('#' + id).val().replace(/[^0-9.]/g, '')) || 0;
        }
        function parseInt2(id) {
            return parseInt($('#' + id).val().replace(/[^0-9]/g, ''), 10) || 0;
        }

        const currentAge              = parseInt2('currentAge');
        const retirementAge           = parseInt2('retirementAge');
        const yearlyIncome            = parseDollar('yearlyIncome');
        const annualIncomeIncrease    = parseNum('incomeIncrease');
        const currentSavings          = parseDollar('currentSavings');
        const retirementSavingsRate   = parseNum('retirementSavingsPercentage') / 100;
        const annualSpending          = parseDollar('annualRetirementSpending');
        const yearsInRetirement       = parseInt2('yearsInRetirement');
        const inflationRate           = parseNum('inflationRate') / 100;

        // Basic validation
        if (currentAge <= 0 || retirementAge <= currentAge) {
            showError('Retirement age must be greater than your current age.');
            return;
        }
        if (yearlyIncome <= 0 || annualSpending <= 0 || yearsInRetirement <= 0) {
            showError('Please enter valid positive values for income, spending, and years in retirement.');
            return;
        }

        const interestRate = parseFloat(localStorage.getItem('currentInterestRate')) || 5.0;
        const returnRate   = interestRate / 100;

        // ── Accumulation phase ──
        const { totalSavings, yearlyData } = calculateAccumulationPhase(
            currentAge, retirementAge, yearlyIncome, annualIncomeIncrease / 100,
            currentSavings, retirementSavingsRate, returnRate
        );

        // ── Retirement savings needed ──
        // PV of a Growing Annuity:
        //   spending grows with inflation each year during retirement,
        //   portfolio continues earning returnRate.
        //   spending_at_retirement = today's spending grown by inflation over accumulation years.
        const yearsToRetirement  = retirementAge - currentAge;
        const spendingAtRetirement = annualSpending * Math.pow(1 + inflationRate, yearsToRetirement);
        const savingsNeeded = calcPVGrowingAnnuity(spendingAtRetirement, inflationRate, returnRate, yearsInRetirement);

        // ── Monthly income metrics ──
        const monthlyTarget      = annualSpending / 12;
        const monthly4PctRule    = (totalSavings * 0.04) / 12;

        displayResults(totalSavings, savingsNeeded, annualSpending, spendingAtRetirement,
                       monthlyTarget, monthly4PctRule, interestRate, yearlyData,
                       retirementAge, currentAge);
    });
});

// ── Present Value of a Growing Annuity ──
// Handles the edge case where return == inflation to avoid division by zero.
function calcPVGrowingAnnuity(payment, growthRate, discountRate, periods) {
    if (Math.abs(discountRate - growthRate) < 0.0001) {
        return payment * periods;
    }
    return payment * (1 - Math.pow((1 + growthRate) / (1 + discountRate), periods)) / (discountRate - growthRate);
}

// ── Accumulation phase simulation ──
function calculateAccumulationPhase(currentAge, retirementAge, yearlyIncome, incomeGrowth,
                                    currentSavings, savingsRate, returnRate) {
    let totalSavings = currentSavings;
    let income = yearlyIncome;
    const yearlyData = [];

    for (let age = currentAge; age < retirementAge; age++) {
        const contribution = savingsRate * income;
        totalSavings = (totalSavings + contribution) * (1 + returnRate);
        yearlyData.push({ age, savings: totalSavings });
        income *= (1 + incomeGrowth);
    }

    localStorage.setItem('yearlyContributions', JSON.stringify(yearlyData));
    return { totalSavings, yearlyData };
}

// ── Display results ──
function displayResults(totalSavings, savingsNeeded, annualSpending, spendingAtRetirement,
                        monthlyTarget, monthly4Pct, interestRate, yearlyData,
                        retirementAge, currentAge) {

    const onTrack = totalSavings >= savingsNeeded;
    const surplus  = totalSavings - savingsNeeded;
    const fmt      = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtD     = (n) => '$' + fmt(Math.round(n));

    // KPI cards
    let summaryHTML = `
        <div class="results-kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Projected at Retirement</div>
                <div class="kpi-value">${fmtD(totalSavings)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Savings Target</div>
                <div class="kpi-value">${fmtD(savingsNeeded)}</div>
                <div class="kpi-sub">inflation-adjusted</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">${onTrack ? 'Surplus' : 'Shortfall'}</div>
                <div class="kpi-value" style="color:${onTrack ? 'var(--accent)' : 'var(--danger)'}">
                    ${onTrack ? '+' : '-'}${fmtD(Math.abs(surplus))}
                </div>
            </div>
        </div>
    `;

    // Monthly income breakdown
    summaryHTML += `
        <div class="income-breakdown">
            <h3>Monthly Income in Retirement</h3>
            <div class="income-row">
                <span class="income-row-label">Your spending target (today's $)</span>
                <span class="income-row-value accent">${fmtD(monthlyTarget)} / mo</span>
            </div>
            <div class="income-row">
                <span class="income-row-label">Spending at retirement (inflation-adjusted)</span>
                <span class="income-row-value">${fmtD(spendingAtRetirement / 12)} / mo</span>
            </div>
            <div class="income-row">
                <span class="income-row-label">Sustainable withdrawal (4% rule)</span>
                <span class="income-row-value">${fmtD(monthly4Pct)} / mo</span>
            </div>
        </div>
    `;

    // Status message
    if (onTrack) {
        summaryHTML += `
            <div class="status-card success">
                <h3>You're on track!</h3>
                <p>Your projected <strong>${fmtD(totalSavings)}</strong> exceeds the inflation-adjusted target of <strong>${fmtD(savingsNeeded)}</strong>,
                giving you a surplus of <strong>${fmtD(surplus)}</strong>.</p>
                <p>The 4% rule suggests a sustainable monthly withdrawal of <strong>${fmtD(monthly4Pct)}</strong>.</p>
            </div>
        `;
    } else {
        const deficitPct = ((savingsNeeded - totalSavings) / savingsNeeded) * 100;
        summaryHTML += `
            <div class="status-card warning">
                <h3>A few adjustments needed</h3>
                <p>Your current plan leaves you <strong>${fmtD(savingsNeeded - totalSavings)}</strong> short of your inflation-adjusted retirement target.</p>
                <ul class="advice-list">${getAdvice(deficitPct)}</ul>
            </div>
        `;
    }

    // Hide placeholder, inject results
    $('.results-placeholder').hide();
    $('#summary').html(summaryHTML);
    $('#exportContainer').show();

    generateChart(yearlyData, savingsNeeded, retirementAge, currentAge);
}

// ── Contextual advice ──
function getAdvice(deficitPct) {
    if (deficitPct <= 10) return `
        <li>Increase your annual savings rate by 1-2% to close the gap.</li>
        <li>Delay retirement by 1-2 years to let your savings compound further.</li>`;
    if (deficitPct <= 30) return `
        <li>Boost your savings rate by 3-5%; even small increases compound significantly.</li>
        <li>Consider reducing your planned retirement spending by 5-10%.</li>`;
    return `
        <li>Delay retirement by 3-5 years to allow your portfolio more time to grow.</li>
        <li>Increase annual contributions by 5-10% of your income.</li>
        <li>Review your expected retirement spending; lifestyle adjustments can have a large impact.</li>`;
}

// ── Chart ──
function generateChart(yearlyData, savingsNeeded, retirementAge, currentAge) {
    $('#chartContainer').empty();
    const canvas = $('<canvas>').appendTo('#chartContainer')[0];
    const ctx = canvas.getContext('2d');

    const labels = yearlyData.map(d => 'Age ' + d.age);
    const data   = yearlyData.map(d => Math.round(d.savings));
    const target = yearlyData.map(() => Math.round(savingsNeeded));

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Projected Savings',
                    data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2.5
                },
                {
                    label: 'Savings Target',
                    data: target,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    fill: false,
                    pointRadius: 0,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter', size: 12 },
                        boxWidth: 12,
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderWidth: 1,
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 12,
                    callbacks: {
                        label: (ctx) => {
                            const label = ctx.dataset.label;
                            const val   = '$' + ctx.raw.toLocaleString();
                            return ` ${label}: ${val}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 10 },
                    grid:  { color: 'rgba(51,65,85,0.5)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        callback: (v) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v.toLocaleString())
                    },
                    grid: { color: 'rgba(51,65,85,0.5)' }
                }
            }
        }
    });
}

// ── Fetch live Treasury interest rate ──
function fetchInterestRates() {
    $.ajax({
        url: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates',
        method: 'GET',
        success: function (response) {
            if (response && response.data && response.data.length > 0) {
                const rate = parseFloat(response.data[0].avg_interest_rate_amt).toFixed(2);
                localStorage.setItem('currentInterestRate', rate);
                $('#headerInterestRate').text(rate + '%');
            } else {
                setDefaultRate();
            }
        },
        error: setDefaultRate
    });
}

function setDefaultRate() {
    const def = '5.00';
    localStorage.setItem('currentInterestRate', def);
    $('#headerInterestRate').text(def + '% (default)');
}

// ── Error display ──
function showError(msg) {
    $('.results-placeholder').show().find('p').text(msg);
    $('.results-placeholder h3').text('Please check your inputs');
    $('#summary').empty();
    $('#exportContainer').hide();
    $('#chartContainer').empty();
}

// ── Nav ──
function addNavListeners() {
    // Navigation uses plain <a> tags. No JS listeners needed.
}

// ── PDF Export ──
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const date = new Date();
    const filename = `RetireMINT_Report_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.pdf`;

    doc.setFontSize(16);
    doc.text('RetireMINT Retirement Report', 10, 15);
    doc.setFontSize(11);
    doc.text(`Generated: ${date.toLocaleDateString()}`, 10, 25);

    doc.setFontSize(13);
    doc.text('Your Inputs', 10, 40);
    doc.setFontSize(11);

    const inputs = {
        'Current Age':                $('#currentAge').val(),
        'Retirement Age':             $('#retirementAge').val(),
        'Annual Income':              '$' + $('#yearlyIncome').val(),
        'Annual Raise':               $('#incomeIncrease').val() + '%',
        'Current Savings':            '$' + $('#currentSavings').val(),
        'Savings Rate':               $('#retirementSavingsPercentage').val() + '%',
        'Annual Retirement Spending': '$' + $('#annualRetirementSpending').val(),
        'Years in Retirement':        $('#yearsInRetirement').val(),
        'Inflation Rate':             $('#inflationRate').val() + '%'
    };

    let y = 50;
    Object.entries(inputs).forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, 10, y);
        y += 9;
    });

    doc.addPage();
    doc.setFontSize(13);
    doc.text('Results', 10, 20);

    $('.export-container').addClass('hide-for-pdf');
    const element = document.querySelector('.results-panel');

    html2canvas(element, { scale: 2, logging: false, useCORS: true, allowTaint: true }).then(canvas => {
        const imgData  = canvas.toDataURL('image/png');
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        doc.addImage(imgData, 'PNG', 10, 30, imgWidth, imgHeight);
        $('.export-container').removeClass('hide-for-pdf');
        doc.save(filename);
    });
}
