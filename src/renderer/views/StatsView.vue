<script setup lang="ts">
import { ref, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import type { StatsData } from '@shared/types'

use([CanvasRenderer, PieChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const stats = ref<StatsData>({
  total_notes: 0, month_new: 0, today_new: 0, category_count: 0, tag_count: 0
})

const categoryOption = ref({})
const trendOption = ref({})

async function loadStats() {
  stats.value = await window.api.getStats()

  const catDist = await window.api.getCategoryDistribution() as { name: string; count: number }[]
  // 过滤掉数量为0的分类
  const filteredCatDist = catDist.filter(c => c.count > 0)
  categoryOption.value = {
    tooltip: { 
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: { 
      bottom: 0,
      type: 'scroll',
      itemWidth: 14,
      itemHeight: 14,
      textStyle: {
        fontSize: 12
      }
    },
    series: [{
      type: 'pie',
      radius: ['50%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { 
        show: true,
        position: 'outside',
        fontSize: 12,
        formatter: '{b}\n{d}%'
      },
      labelLine: {
        show: true,
        length: 15,
        length2: 10,
        smooth: true
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      data: filteredCatDist.map(c => ({ name: c.name, value: c.count }))
    }]
  }

  const trend = await window.api.getMonthlyTrend() as { month: string; count: number }[]
  trendOption.value = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: trend.map(t => t.month).reverse() },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: trend.map(t => t.count).reverse(),
      itemStyle: { color: '#409EFF', borderRadius: [4, 4, 0, 0] }
    }]
  }
}

onMounted(loadStats)
</script>

<template>
  <div class="stats-view">
    <div class="view-header">
      <h2>数据统计</h2>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total_notes }}</div>
        <div class="stat-label">总笔记数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.today_new }}</div>
        <div class="stat-label">今日新增</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.month_new }}</div>
        <div class="stat-label">本月新增</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.category_count }}</div>
        <div class="stat-label">分类数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.tag_count }}</div>
        <div class="stat-label">标签数量</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-panel">
        <h3>分类分布</h3>
        <VChart :option="categoryOption" style="height:400px" autoresize />
      </div>
      <div class="chart-panel">
        <h3>月度创建趋势</h3>
        <VChart :option="trendOption" style="height:400px" autoresize />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-view {
  padding: 24px;
  height: 100%;
  overflow: auto;
}

.view-header {
  margin-bottom: 24px;
}

.view-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  padding: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--accent-color);
}

.stat-label {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
}

.chart-panel {
  padding: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.chart-panel h3 {
  margin-bottom: 16px;
  font-size: 15px;
}
</style>
