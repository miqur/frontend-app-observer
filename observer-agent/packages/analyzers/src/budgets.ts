import type { ObserverConfig } from '@observer/config';
import type { SnapshotRecord } from '@observer/core';
import type { BudgetViolation } from './types.js';

export function evaluateBudgets(current: SnapshotRecord, config: ObserverConfig): BudgetViolation[] {
  const issues: BudgetViolation[] = [];
  const { budgets } = config;

  if (budgets.maxTotalBundleBytes != null && current.bundle) {
    if (current.bundle.totalBytes > budgets.maxTotalBundleBytes) {
      const over = current.bundle.totalBytes - budgets.maxTotalBundleBytes;
      issues.push({
        id: 'budget-total-bundle',
        message: `Total bundle ${current.bundle.totalBytes} B exceeds budget ${budgets.maxTotalBundleBytes} B (over by ${over} B)`,
        severity: over > budgets.maxTotalBundleBytes * 0.25 ? 'critical' : 'warning'
      });
    }
  }

  if (budgets.maxVendorBytes != null && current.bundle) {
    if (current.bundle.vendorBytes > budgets.maxVendorBytes) {
      const over = current.bundle.vendorBytes - budgets.maxVendorBytes;
      issues.push({
        id: 'budget-vendor',
        message: `Vendor footprint ${current.bundle.vendorBytes} B exceeds budget ${budgets.maxVendorBytes} B (over by ${over} B)`,
        severity: over > budgets.maxVendorBytes * 0.3 ? 'critical' : 'warning'
      });
    }
  }

  if (budgets.minLighthousePerformance != null && current.lighthouse?.performance != null) {
    if (current.lighthouse.performance < budgets.minLighthousePerformance) {
      const gap = budgets.minLighthousePerformance - current.lighthouse.performance;
      issues.push({
        id: 'budget-lighthouse-performance',
        message: `Lighthouse performance ${current.lighthouse.performance} is below budget ${budgets.minLighthousePerformance} (gap ${gap})`,
        severity: gap >= 15 ? 'critical' : 'warning'
      });
    }
  }

  return issues;
}
