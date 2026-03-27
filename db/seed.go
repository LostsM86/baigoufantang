package db

import (
	"encoding/json"
	"wxcloudrun-golang/db/model"

	"gorm.io/gorm"
)

type seedCategory struct {
	Name  string
	Sort  int
	Items []seedMenuItem
}

type seedMenuItem struct {
	CategoryName string
	Name         string
	Description  string
	Price        float64
	MealSlots    []string
	Sort         int
}

func seedInitialData(database *gorm.DB) error {
	categories := []seedCategory{
		{
			Name: "小吃",
			Sort: 10,
			Items: []seedMenuItem{
				{CategoryName: "小吃", Name: "煎鸡蛋", Price: 0, MealSlots: []string{"breakfast"}, Sort: 10},
				{CategoryName: "小吃", Name: "焦香鸡翅", Price: 0, MealSlots: []string{"night_snack"}, Sort: 20},
			},
		},
		{
			Name: "正餐",
			Sort: 20,
			Items: []seedMenuItem{
				{CategoryName: "正餐", Name: "辣椒炒肉", Price: 0, MealSlots: []string{"lunch", "dinner"}, Sort: 10},
				{CategoryName: "正餐", Name: "炒蕨菜", Price: 0, MealSlots: []string{"lunch", "dinner"}, Sort: 20},
			},
		},
		{
			Name: "主食",
			Sort: 30,
			Items: []seedMenuItem{
				{CategoryName: "主食", Name: "清汤面", Price: 0, MealSlots: []string{"breakfast"}, Sort: 10},
				{CategoryName: "主食", Name: "米饭", Price: 0, MealSlots: []string{"lunch", "dinner"}, Sort: 20},
			},
		},
		{
			Name: "饮料",
			Sort: 40,
			Items: []seedMenuItem{
				{CategoryName: "饮料", Name: "豆浆", Price: 0, MealSlots: []string{"breakfast"}, Sort: 10},
				{CategoryName: "饮料", Name: "香蕉奶昔", Price: 0, MealSlots: []string{"breakfast"}, Sort: 20},
			},
		},
	}

	categoryMap := map[string]model.Category{}
	for _, categorySeed := range categories {
		category := model.Category{}
		err := database.Where("name = ?", categorySeed.Name).First(&category).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}

		if err == gorm.ErrRecordNotFound {
			category = model.Category{
				Name:    categorySeed.Name,
				Sort:    categorySeed.Sort,
				Enabled: true,
			}
			if err := database.Create(&category).Error; err != nil {
				return err
			}
		} else {
			if err := database.Model(&category).Updates(map[string]interface{}{
				"sort":    categorySeed.Sort,
				"enabled": true,
			}).Error; err != nil {
				return err
			}
		}
		categoryMap[categorySeed.Name] = category
	}

	for _, categorySeed := range categories {
		for _, itemSeed := range categorySeed.Items {
			menuItem := model.MenuItem{}
			err := database.Where("name = ?", itemSeed.Name).First(&menuItem).Error
			if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}

			mealSlotsPayload, marshalErr := json.Marshal(itemSeed.MealSlots)
			if marshalErr != nil {
				return marshalErr
			}

			updatePayload := map[string]interface{}{
				"category_id": categoryMap[itemSeed.CategoryName].ID,
				"description": itemSeed.Description,
				"image_url":   "",
				"price":       itemSeed.Price,
				"meal_slots":  string(mealSlotsPayload),
				"sort":        itemSeed.Sort,
				"enabled":     true,
			}

			if err == gorm.ErrRecordNotFound {
				menuItem = model.MenuItem{
					CategoryID:  categoryMap[itemSeed.CategoryName].ID,
					Name:        itemSeed.Name,
					Description: itemSeed.Description,
					ImageURL:    "",
					Price:       itemSeed.Price,
					MealSlots:   string(mealSlotsPayload),
					Sort:        itemSeed.Sort,
					Enabled:     true,
				}
				if err := database.Create(&menuItem).Error; err != nil {
					return err
				}
				continue
			}

			if err := database.Model(&menuItem).Updates(updatePayload).Error; err != nil {
				return err
			}
		}
	}

	if err := database.Model(&model.Category{}).
		Where("name IN ?", []string{"早餐", "夜宵"}).
		Updates(map[string]interface{}{"enabled": false}).Error; err != nil {
		return err
	}

	return nil
}
