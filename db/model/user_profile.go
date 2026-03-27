package model

import "time"

type UserProfile struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	RequesterID string    `gorm:"size:64;uniqueIndex;not null" json:"requesterId"`
	DisplayName string    `gorm:"size:64;not null" json:"displayName"`
	AvatarURL   string    `gorm:"size:512" json:"avatarUrl"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (UserProfile) TableName() string {
	return "food_user_profile"
}
