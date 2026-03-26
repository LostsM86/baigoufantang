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
	Name        string
	Description string
	Price       float64
	MealSlots   []string
	Sort        int
}

func seedInitialData(database *gorm.DB) error {
	categories := []seedCategory{
		{
			Name: "早餐",
			Sort: 10,
			Items: []seedMenuItem{
				{Name: "豆浆", Price: 0, MealSlots: []string{"breakfast"}, Sort: 10},
				{Name: "香蕉奶昔", Price: 0, MealSlots: []string{"breakfast"}, Sort: 20},
				{Name: "煎鸡蛋", Price: 0, MealSlots: []string{"breakfast"}, Sort: 30},
				{Name: "清汤面", Price: 0, MealSlots: []string{"breakfast"}, Sort: 40},
			},
		},
		{
			Name: "正餐",
			Sort: 20,
			Items: []seedMenuItem{
				{Name: "辣椒炒肉", Price: 0, MealSlots: []string{"lunch", "dinner"}, Sort: 10},
				{Name: "炒蕨菜", Price: 0, MealSlots: []string{"lunch", "dinner"}, Sort: 20},
			},
		},
		{
			Name: "夜宵",
			Sort: 30,
			Items: []seedMenuItem{
				{Name: "焦香鸡翅", Price: 0, MealSlots: []string{"night_snack"}, Sort: 10},
			},
		},
	}

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

		for _, itemSeed := range categorySeed.Items {
			menuItem := model.MenuItem{}
			err := database.Where("category_id = ? AND name = ?", category.ID, itemSeed.Name).First(&menuItem).Error
			if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}

			mealSlotsPayload, marshalErr := json.Marshal(itemSeed.MealSlots)
			if marshalErr != nil {
				return marshalErr
			}

			updatePayload := map[string]interface{}{
				"description": itemSeed.Description,
				"price":       itemSeed.Price,
				"meal_slots":  string(mealSlotsPayload),
				"sort":        itemSeed.Sort,
				"enabled":     true,
			}

			if err == gorm.ErrRecordNotFound {
				menuItem = model.MenuItem{
					CategoryID:  category.ID,
					Name:        itemSeed.Name,
					Description: itemSeed.Description,
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

	return nil
}
